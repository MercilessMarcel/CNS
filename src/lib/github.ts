const API_BASE = 'https://api.github.com';

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

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install yt-dlp
          sudo apt-get update
          sudo apt-get install -y ffmpeg

      - name: Create downloads directory
        run: mkdir -p downloads

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
          
          case "$QUALITY" in
            "best")
              QUALITY_OPT="bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
              ;;
            "1080p")
              QUALITY_OPT="bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]"
              ;;
            "720p")
              QUALITY_OPT="bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]"
              ;;
            "480p")
              QUALITY_OPT="bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]"
              ;;
            "audio")
              QUALITY_OPT="bestaudio/best"
              ;;
            *)
              QUALITY_OPT="best"
              ;;
          esac
          
          if [ "$FORMAT" = "mp3" ] || [ "$QUALITY" = "audio" ]; then
            OUTPUT_TEMPLATE="downloads/%(title)s.%(ext)s"
            yt-dlp \
              --format "$QUALITY_OPT" \
              --extract-audio \
              --audio-format mp3 \
              --audio-quality 0 \
              --output "$OUTPUT_TEMPLATE" \
              --write-info-json \
              --write-thumbnail \
              --convert-thumbnails jpg \
              --embed-thumbnail \
              "$URL"
          else
            OUTPUT_TEMPLATE="downloads/%(title)s.%(ext)s"
            yt-dlp \
              --format "$QUALITY_OPT" \
              --merge-output-format "$FORMAT" \
              --output "$OUTPUT_TEMPLATE" \
              --write-info-json \
              --write-thumbnail \
              --convert-thumbnails jpg \
              "$URL"
          fi
          
          echo "Download complete"

      - name: Extract metadata
        id: metadata
        run: |
          INFO_JSON=$(ls -t downloads/*.info.json 2>/dev/null | head -1 || echo "")
          if [ -n "$INFO_JSON" ]; then
            python3 << 'PYEOF'
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
        }
        
        base_name = info_file.replace('.info.json', '')
        thumb_extensions = ['.jpg', '.webp', '.png']
        thumbnail = None
        for ext in thumb_extensions:
            thumb_path = f'downloads/{base_name}{ext}'
            if os.path.exists(thumb_path):
                thumbnail = thumb_path
                break
        
        if thumbnail:
            metadata['thumbnail'] = thumbnail
        
        meta_file = f'downloads/{base_name}.json'
        with open(meta_file, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)
        
        print(f'Created metadata: {meta_file}')
    except Exception as e:
        print(f'Error processing {info_file}: {e}', file=sys.stderr)
PYEOF
          fi

      - name: Cleanup temp files
        run: |
          rm -f downloads/*.info.json
          rm -f downloads/*.webp downloads/*.png

      - name: Commit and push
        run: |
          git config user.name "CNS Downloader"
          git config user.email "cns@system.local"
          
          git add downloads/
          
          if git diff --cached --quiet; then
            echo "No changes to commit"
          else
            git commit -m "CNS: Download $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
            git push
            echo "Committed and pushed"
          fi

      - name: Cleanup old downloads
        if: always()
        run: |
          cd downloads || exit 0
          
          VIDEO_COUNT=$(ls -1 *.mp4 *.webm *.mkv *.mp3 2>/dev/null | wc -l)
          
          if [ "$VIDEO_COUNT" -gt 50 ]; then
            echo "Too many files ($VIDEO_COUNT), cleaning up old ones..."
            ls -t *.mp4 *.webm *.mkv *.mp3 2>/dev/null | tail -n +51 | while read file; do
              echo "Removing old file: $file"
              rm -f "$file"
              base="\${file%.*}"
              rm -f "\${base}.json"
              rm -f "\${base}.jpg"
            done
            
            cd ..
            git add downloads/
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

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const config = this.getConfig();
    if (!config) throw new Error('GitHub config not set');

    const url = `${API_BASE}${path}`;
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${config.token}`,
      'User-Agent': 'CNS-YouTube-Downloader',
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
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
    if (!config) throw new Error('GitHub config not set');

    // Workflow dispatch returns 204 No Content on success
    const url_path = `${API_BASE}/repos/${config.owner}/${config.repo}/actions/workflows/download.yml/dispatches`;
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
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.status;
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
}

export const github = new GitHubClient();
