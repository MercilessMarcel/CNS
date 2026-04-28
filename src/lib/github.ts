const API_BASE = 'https://api.github.com';

// Error types for better handling
export class CNSError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'CNSError';
  }
}

export const ErrorCodes = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  AUTH_FAILED: 'AUTH_FAILED',
  REPO_NOT_FOUND: 'REPO_NOT_FOUND',
  WORKFLOW_FAILED: 'WORKFLOW_FAILED',
  COOKIES_MISSING: 'COOKIES_MISSING',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  INVALID_URL: 'INVALID_URL',
  CONFIG_MISSING: 'CONFIG_MISSING',
} as const;

// Workflow YAML content embedded for auto-setup
const WORKFLOW_YML = `name: CNS Download Video

on:
  workflow_dispatch:
    inputs:
      url:
        description: 'YouTube URL to download'
        required: true
        type: string
      quality:
        description: 'Video quality'
        required: true
        default: 'best'
        type: choice
        options:
          - best
          - 1080p
          - 720p
          - 480p
          - audio
      format:
        description: 'Output format'
        required: true
        default: 'mp4'
        type: choice
        options:
          - mp4
          - webm
          - mp3

jobs:
  download:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          token: \${{ secrets.GITHUB_TOKEN }}

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install yt-dlp[default,EJS]
          sudo apt-get update
          sudo apt-get install -y ffmpeg

      - name: Create downloads directory
        run: mkdir -p downloads

      - name: Check cookies
        run: |
          if [ ! -f "cookies.txt" ]; then
            echo "ERROR: cookies.txt not found in repository"
            echo "Please upload YouTube cookies via CNS Settings"
            exit 1
          fi
          echo "Cookies file found: $(wc -l < cookies.txt) lines"

      - name: Download video
        id: download
        env:
          URL: \${{ github.event.inputs.url }}
          QUALITY: \${{ github.event.inputs.quality }}
          FORMAT: \${{ github.event.inputs.format }}
        run: |
          echo "Starting download..."
          echo "URL: $URL"
          echo "Quality: $QUALITY"
          echo "Format: $FORMAT"
          
          # Build quality options - more flexible for Shorts
          case "$QUALITY" in
            "best")
              QUALITY_OPT="bestvideo+bestaudio/best"
              ;;
            "1080p")
              QUALITY_OPT="bestvideo[height<=1080]+bestaudio/best[height<=1080]"
              ;;
            "720p")
              QUALITY_OPT="bestvideo[height<=720]+bestaudio/best[height<=720]"
              ;;
            "480p")
              QUALITY_OPT="bestvideo[height<=480]+bestaudio/best[height<=480]/worst"
              ;;
            "audio")
              QUALITY_OPT="bestaudio/best"
              ;;
            *)
              QUALITY_OPT="best"
              ;;
          esac
          
          # Cookies are mandatory - fail if missing
          if [ ! -f "cookies.txt" ]; then
            echo "ERROR: cookies.txt required but not found"
            exit 1
          fi
          
          if [ "$FORMAT" = "mp3" ] || [ "$QUALITY" = "audio" ]; then
            # Audio-only download
            OUTPUT_TEMPLATE="downloads/%(title)s.%(ext)s"
            yt-dlp \\
              --format "$QUALITY_OPT" \\
              --extract-audio \\
              --audio-format mp3 \\
              --audio-quality 0 \\
              --output "$OUTPUT_TEMPLATE" \\
              --write-info-json \\
              --write-thumbnail \\
              --convert-thumbnails jpg \\
              --embed-thumbnail \\
              --cookies cookies.txt \\
              --js-runtimes node \\
              "$URL"
          else
            # Video download - add fallback for Shorts
            OUTPUT_TEMPLATE="downloads/%(title)s.%(ext)s"
            yt-dlp \\
              --format "$QUALITY_OPT" \\
              --merge-output-format "$FORMAT" \\
              --output "$OUTPUT_TEMPLATE" \\
              --write-info-json \\
              --write-thumbnail \\
              --convert-thumbnails jpg \\
              --cookies cookies.txt \\
              --js-runtimes node \\
              --retries 3 \\
              --fragment-retries 3 \\
              "$URL" || \\
            # Fallback: try with worst quality if best fails (Shorts compatibility)
            yt-dlp \\
              --format "worstvideo+worstaudio/worst" \\
              --merge-output-format "$FORMAT" \\
              --output "$OUTPUT_TEMPLATE" \\
              --write-info-json \\
              --write-thumbnail \\
              --convert-thumbnails jpg \\
              --cookies cookies.txt \\
              --js-runtimes node \\
              "$URL"
          fi
          
          echo "Download complete"
          
          # Get the downloaded file name
          DOWNLOADED_FILE=$(ls -t downloads/*.mp4 downloads/*.webm downloads/*.mkv downloads/*.mp3 2>/dev/null | head -1 || echo "")
          if [ -n "$DOWNLOADED_FILE" ]; then
            echo "file=$DOWNLOADED_FILE" >> $GITHUB_OUTPUT
            echo "Downloaded: $DOWNLOADED_FILE"
          fi

      - name: Extract metadata
        id: metadata
        run: |
          # Find info JSON file
          INFO_JSON=$(ls -t downloads/*.info.json 2>/dev/null | head -1 || echo "")
          if [ -n "$INFO_JSON" ]; then
            echo "Found metadata: $INFO_JSON"
            # Create simplified metadata file
            python3 << 'EOF'
          import json
          import sys
          import os
          
          info_files = [f for f in os.listdir('downloads') if f.endswith('.info.json')]
          for info_file in info_files:
              try:
                  with open(f'downloads/{info_file}', 'r', encoding='utf-8') as f:
                      data = json.load(f)
                  
                  metadata = {
                      'title': data.get('title', 'Unknown'),
                      'uploader': data.get('uploader', 'Unknown'),
                      'duration': data.get('duration_string', 'Unknown'),
                      'upload_date': data.get('upload_date', 'Unknown'),
                      'view_count': data.get('view_count', 0),
                      'description': data.get('description', '')[:200],
                      'original_url': data.get('webpage_url', ''),
                      'downloaded_at': data.get('_downloaded_at', ''),
                  }
                  
                  # Find thumbnail - try local file first, then use URL from info.json
                  base_name = info_file.replace('.info.json', '')
                  thumb_extensions = ['.jpg', '.webp', '.png']
                  thumbnail = None
                  
                  # Try to find local thumbnail with matching base name
                  for ext in thumb_extensions:
                      thumb_path = f'downloads/{base_name}{ext}'
                      if os.path.exists(thumb_path):
                          thumbnail = thumb_path
                          break
                  
                  # If not found, try any jpg file in downloads (fallback)
                  if not thumbnail:
                      import glob
                      jpg_files = glob.glob('downloads/*.jpg')
                      if jpg_files:
                          # Use the most recently modified jpg
                          thumbnail = max(jpg_files, key=os.path.getmtime)
                  
                  # If still not found, use thumbnail URL from info.json
                  if not thumbnail and 'thumbnail' in data:
                      metadata['thumbnail'] = data['thumbnail']
                  elif thumbnail:
                      metadata['thumbnail'] = thumbnail
                  
                  # Save metadata
                  meta_file = f'downloads/{base_name}.json'
                  with open(meta_file, 'w', encoding='utf-8') as f:
                      json.dump(metadata, f, ensure_ascii=False, indent=2)
                  
                  print(f'Created metadata: {meta_file}')
              except Exception as e:
                  print(f'Error processing {info_file}: {e}', file=sys.stderr)
          EOF
          fi

      - name: Cleanup temp files
        run: |
          # Remove info.json and thumbnail files (keep jpg thumbnails)
          rm -f downloads/*.info.json
          rm -f downloads/*.webp downloads/*.png

      - name: Split large files
        run: |
          # Split files >95MB into zip chunks
          MAX_SIZE=$((95 * 1024 * 1024))  # 95MB
          
          cd downloads
          for file in *; do
            if [ -f "\$file" ]; then
              size=\$(stat -c%s "\$file" 2>/dev/null || stat -f%z "\$file" 2>/dev/null || echo 0)
              if [ "\$size" -gt "\$MAX_SIZE" ]; then
                echo "Splitting large file: \$file (\$(numfmt --to=iec-i --suffix=B \$size 2>/dev/null || echo \$size bytes))"
                
                base="\${file%.*}"
                ext="\${file##*.}"
                
                # Create split zip (95MB chunks, no password)
                zip -s 95m "\${base}.zip" -j "\$file"
                
                # Count zip parts (including .zip and .z*)
                part_count=\$(ls -1 "\${base}".zip "\${base}".z* 2>/dev/null | wc -l)
                
                # Remove original file
                rm -f "\$file"
                
                # Update metadata
                if [ -f "\${base}.json" ]; then
                  python3 -c "import json,sys; f=open(sys.argv[1],'r'); d=json.load(f); f.close(); d['split']=True; d['zip']=True; d['parts']=int(sys.argv[2]); d['original_size']=int(sys.argv[3]); d['ext']=sys.argv[4]; f=open(sys.argv[1],'w'); json.dump(d,f,indent=2); f.close()" "\${base}.json" "\$part_count" "\$size" "\$ext"
                fi
                
                echo "Split into \$part_count zip parts"
              fi
            fi
          done
          cd ..

      - name: Commit and push
        run: |
          git config user.name "CNS Downloader"
          git config user.email "cns@system.local"
          
          git add downloads/
          
          if git diff --cached --quiet; then
            echo "No changes to commit"
          else
            git commit -m "CNS: Download \$(date -u +'%Y-%m-%d %H:%M:%S UTC')"
            git push
            echo "Committed and pushed"
          fi

      - name: Cleanup old downloads
        if: always()
        run: |
          # Keep only last 50 files to prevent repo bloat
          cd downloads
          
          # Count video files
          VIDEO_COUNT=$(ls -1 *.mp4 *.webm *.mkv *.mp3 2>/dev/null | wc -l)
          
          if [ "$VIDEO_COUNT" -gt 50 ]; then
            echo "Too many files ($VIDEO_COUNT), cleaning up old ones..."
            # List files by modification time, skip the 50 newest
            ls -t *.mp4 *.webm *.mkv *.mp3 2>/dev/null | tail -n +51 | while read file; do
              echo "Removing old file: $file"
              rm -f "$file"
              # Also remove associated metadata
              base="\${file%.*}"
              rm -f "\${base}.json"
              rm -f "\${base}.jpg"
            done
            
            # Commit cleanup
            git add -A
            git commit -m "CNS: Auto cleanup old files" || true
            git push || true
          fi
`;

export interface DownloadJob {
  id: string;
  url: string;
  quality: string;
  format: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  progress: number;
  logs: string[];
  createdAt: string;
}

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

class GitHubClient {
  private config: GitHubConfig | null = null;

  setConfig(config: GitHubConfig) {
    this.config = config;
    localStorage.setItem('cns_github_config', JSON.stringify(config));
  }

  getConfig(): GitHubConfig | null {
    if (this.config) return this.config;
    const stored = localStorage.getItem('cns_github_config');
    if (stored) {
      this.config = JSON.parse(stored);
      return this.config;
    }
    return null;
  }

  clearConfig() {
    this.config = null;
    localStorage.removeItem('cns_github_config');
  }

  private async requestWithRetry(path: string, options: RequestInit = {}, retries: number = 3): Promise<any> {
    const config = this.getConfig();
    if (!config) throw new CNSError('GitHub config not set', ErrorCodes.CONFIG_MISSING, false);

    const url = `${API_BASE}${path}`;
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${config.token}`,
      'User-Agent': 'CNS-YouTube-Downloader',
      ...options.headers,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(url, { ...options, headers });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const message = errorData.message || `HTTP ${response.status}`;
          
          // Handle specific error codes
          if (response.status === 401) {
            throw new CNSError(`Authentication failed: ${message}`, ErrorCodes.AUTH_FAILED, false);
          }
          if (response.status === 403) {
            const isRateLimit = errorData.message?.includes('rate limit');
            throw new CNSError(
              isRateLimit ? `Rate limited: ${message}` : `Forbidden: ${message}`,
              isRateLimit ? ErrorCodes.RATE_LIMITED : ErrorCodes.AUTH_FAILED,
              isRateLimit // Rate limits are retryable
            );
          }
          if (response.status === 404) {
            throw new CNSError(`Not found: ${message}`, ErrorCodes.REPO_NOT_FOUND, false);
          }
          if (response.status >= 500) {
            throw new CNSError(`Server error: ${message}`, ErrorCodes.NETWORK_ERROR, true);
          }
          
          throw new CNSError(`Request failed: ${message}`, ErrorCodes.NETWORK_ERROR, attempt < retries - 1);
        }

        // Handle 204 No Content
        if (response.status === 204) {
          return null;
        }

        return response.json();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        
        // Don't retry on auth errors or 404s
        if (err instanceof CNSError && !err.retryable) {
          throw err;
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new CNSError('Request failed after retries', ErrorCodes.NETWORK_ERROR, false);
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    return this.requestWithRetry(path, options, 3);
  }

  async validateRepo(): Promise<boolean> {
    try {
      const config = this.getConfig();
      if (!config) return false;
      await this.request(`/repos/${config.owner}/${config.repo}`);
      return true;
    } catch {
      return false;
    }
  }

  async triggerWorkflow(url: string, quality: string, format: string): Promise<number> {
    const config = this.getConfig();
    if (!config) throw new CNSError('GitHub config not set', ErrorCodes.CONFIG_MISSING, false);

    // Validate URL format
    try {
      new URL(url);
    } catch {
      throw new CNSError('Invalid URL format', ErrorCodes.INVALID_URL, false);
    }

    // Workflow dispatch returns 204 No Content on success
    const url_path = `${API_BASE}/repos/${config.owner}/${config.repo}/actions/workflows/download.yml/dispatches`;
    
    try {
      const response = await fetch(url_path, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${config.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'CNS-YouTube-Downloader',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            url,
            quality,
            format,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.message || `HTTP ${response.status}`;
        
        if (response.status === 401) {
          throw new CNSError(`Invalid GitHub token: ${message}`, ErrorCodes.AUTH_FAILED, false);
        }
        if (response.status === 404) {
          throw new CNSError(`Workflow not found. Please run auto-setup first.`, ErrorCodes.WORKFLOW_FAILED, false);
        }
        if (response.status === 422) {
          throw new CNSError(`Invalid workflow inputs: ${message}`, ErrorCodes.WORKFLOW_FAILED, false);
        }
        if (response.status >= 500) {
          throw new CNSError(`GitHub server error: ${message}`, ErrorCodes.NETWORK_ERROR, true);
        }
        
        throw new CNSError(`Workflow trigger failed: ${message}`, ErrorCodes.WORKFLOW_FAILED, false);
      }

      return response.status;
    } catch (err) {
      if (err instanceof CNSError) throw err;
      throw new CNSError(`Network error: ${err instanceof Error ? err.message : 'Unknown error'}`, ErrorCodes.NETWORK_ERROR, true);
    }
  }

  async getWorkflowRuns(): Promise<any[]> {
    const config = this.getConfig();
    if (!config) throw new Error('GitHub config not set');

    const data = await this.request(
      `/repos/${config.owner}/${config.repo}/actions/runs?workflow_id=download.yml&per_page=10`
    );
    return data.workflow_runs || [];
  }

  async getWorkflowLogs(runId: number): Promise<string> {
    const config = this.getConfig();
    if (!config) throw new Error('GitHub config not set');

    try {
      const response = await fetch(
        `${API_BASE}/repos/${config.owner}/${config.repo}/actions/runs/${runId}/logs`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${config.token}`,
          },
        }
      );
      
      if (!response.ok) return '';
      return await response.text();
    } catch {
      return '';
    }
  }

  async getDownloads(): Promise<any[]> {
    const config = this.getConfig();
    if (!config) throw new Error('GitHub config not set');

    try {
      const data = await this.request(
        `/repos/${config.owner}/${config.repo}/contents/downloads`
      );
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async deleteFile(path: string, sha: string): Promise<void> {
    const config = this.getConfig();
    if (!config) throw new Error('GitHub config not set');

    await this.request(
      `/repos/${config.owner}/${config.repo}/contents/${path}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `CNS: Delete ${path}`,
          sha,
        }),
      }
    );
  }

  async getFileContent(path: string): Promise<{ content: string; sha: string } | null> {
    const config = this.getConfig();
    if (!config) throw new Error('GitHub config not set');

    try {
      const data = await this.request(
        `/repos/${config.owner}/${config.repo}/contents/${path}`
      );
      // Handle Unicode base64 decoding properly
      const base64Content = data.content.replace(/\s/g, '');
      const binaryString = atob(base64Content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const content = new TextDecoder('utf-8').decode(bytes);
      return {
        content,
        sha: data.sha,
      };
    } catch {
      return null;
    }
  }

  // Auto-setup: Create repo and workflow file
  async createRepo(name: string, token: string): Promise<{ owner: string; repo: string }> {
    // Create repo using user endpoint
    const response = await fetch(`${API_BASE}/user/repos`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'CNS-YouTube-Downloader',
      },
      body: JSON.stringify({
        name,
        description: 'CNS YouTube Downloader - Auto-generated storage',
        private: true,
        auto_init: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Failed to create repo: HTTP ${response.status}`);
    }

    const data = await response.json();
    return { owner: data.owner.login, repo: data.name };
  }

  async setupWorkflow(token: string, owner: string, repo: string): Promise<void> {
    // Commit workflow file to repo
    const path = '.github/workflows/download.yml';
    const content = btoa(WORKFLOW_YML);
    
    const response = await fetch(`${API_BASE}/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'CNS-YouTube-Downloader',
      },
      body: JSON.stringify({
        message: 'CNS: Initialize download workflow',
        content,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Failed to setup workflow: HTTP ${response.status}`);
    }
  }

  async autoSetup(token: string, repoName: string = 'cns-downloads'): Promise<GitHubConfig> {
    // Step 1: Create repo
    const { owner, repo } = await this.createRepo(repoName, token);
    
    // Step 2: Setup workflow
    await this.setupWorkflow(token, owner, repo);
    
    // Step 3: Save config
    const config: GitHubConfig = { token, owner, repo };
    this.setConfig(config);
    
    return config;
  }

  // Cookies management
  getCookies(): string | null {
    return localStorage.getItem('cns_cookies');
  }

  clearCookies(): void {
    localStorage.removeItem('cns_cookies');
  }

  async uploadCookies(cookiesContent: string): Promise<void> {
    const config = this.getConfig();
    if (!config) throw new Error('GitHub config not set');

    const content = btoa(cookiesContent);
    const path = 'cookies.txt';
    
    // Check if file exists to get SHA
    let sha: string | undefined;
    try {
      const existing = await this.request(
        `/repos/${config.owner}/${config.repo}/contents/${path}`
      );
      sha = existing.sha;
    } catch {
      // File doesn't exist, will create new
    }

    const body: Record<string, string> = {
      message: 'CNS: Update cookies',
      content,
    };
    if (sha) body.sha = sha;

    const response = await fetch(`${API_BASE}/repos/${config.owner}/${config.repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${config.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'CNS-YouTube-Downloader',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Failed to upload cookies: HTTP ${response.status}`);
    }
  }
}

export const github = new GitHubClient();
