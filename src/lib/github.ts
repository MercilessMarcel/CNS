import { logger } from './logger';

const API_BASE =
  typeof window !== 'undefined' && window.location.origin.startsWith('http://localhost:')
    ? '/github-api'
    : 'https://api.github.com';
const SECURE_TOKEN_PLACEHOLDER = '__cns_secure_token__';
const SESSION_TOKEN_KEY = 'cns_github_token_session';
const GET_CACHE_TTL_MS = 12_000;
const MAX_GET_CACHE = 160;

declare global {
  interface Window {
    __TAURI__?: any;
    __TAURI_INVOKE__?: (command: string, payload?: any) => Promise<any>;
  }
}

function utf8ToBase64GitHub(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function logGithubApiHttpError(
  message: string,
  detail: {
    method: string;
    path: string;
    status: number;
    attempt?: number;
    requestId: string | null;
    githubMessage?: string;
    documentationUrl?: string;
    errors?: unknown;
  }
) {
  logger.warn(message, detail);
}

// Safe localStorage wrapper with fallback
const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      logger.warn(`Storage get failed for ${key}`, { error: err });
      return null;
    }
  },

  set(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (err) {
      logger.warn(`Storage set failed for ${key}`, { error: err });
      return false;
    }
  },

  remove(key: string): boolean {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (err) {
      logger.warn(`Storage remove failed for ${key}`, { error: err });
      return false;
    }
  },
};

// Safe JSON parse with fallback
function safeJSONParse<T>(str: string | null, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch (err) {
    logger.warn('JSON parse failed, using fallback', { error: err });
    return fallback;
  }
}

// Validate GitHubConfig object
function isValidConfig(obj: unknown): obj is GitHubConfig {
  if (!obj || typeof obj !== 'object') return false;
  const config = obj as Record<string, unknown>;
  return (
    typeof config.token === 'string' &&
    typeof config.owner === 'string' &&
    typeof config.repo === 'string' &&
    config.token.length > 0 &&
    config.owner.length > 0 &&
    config.repo.length > 0
  );
}

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

concurrency:
  group: cns-download-queue
  cancel-in-progress: false

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
          fetch-depth: 1
          filter: blob:none
          sparse-checkout: |
            .github/workflows
            cookies.txt
          sparse-checkout-cone-mode: false

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
          python3 << 'PYCHK'
          import math
          import sys
          import time
          now = int(time.time())
          auth = {
              'sid', 'hsid', 'ssid', 'apisid', 'sapisid',
              '__secure-1psid', '__secure-3psid', '__secure-1psidts', '__secure-3psidts',
              'login_info',
          }
          has_rows = False
          live = False
          with open('cookies.txt', 'r', encoding='utf-8', errors='replace') as f:
              for raw in f:
                  line = raw.strip()
                  if not line or line.startswith('#'):
                      continue
                  parts = line.split(chr(9))
                  if len(parts) < 7:
                      continue
                  has_rows = True
                  domain = (parts[0] or '').lower()
                  name = (parts[5] or '').lower()
                  try:
                      expiry = int(parts[4] or '0')
                  except ValueError:
                      expiry = float('nan')
                  if 'youtube.com' not in domain and 'google.com' not in domain:
                      continue
                  if name not in auth:
                      continue
                  if math.isnan(expiry) or expiry <= 0 or expiry > now:
                      live = True
                      break
          if not has_rows:
              print('::error title=CNS cookies invalid::cookies.txt is not a valid Netscape cookies file. Export fresh cookies from your browser (Get cookies.txt) and upload via CNS Settings.')
              print('ERROR: CNS_COOKIES_INVALID')
              sys.exit(1)
          if not live:
              print('::error title=CNS cookies expired::YouTube/Google auth cookies in cookies.txt look expired. Open CNS Settings, paste fresh cookies.txt from the browser where you are logged into youtube.com, save, then retry.')
              print('ERROR: CNS_COOKIES_EXPIRED cookies are no longer valid')
              sys.exit(1)
          PYCHK

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
                
                shopt -s nullglob
                n_zip=0
                [ -f "\${base}.zip" ] && n_zip=1 || true
                n_z=0
                for f in "\${base}".z[0-9][0-9]; do
                  [ -f "\$f" ] && n_z=\$((n_z + 1)) || true
                done
                part_count=\$((n_zip + n_z))
                
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
          
          git restore cookies.txt 2>/dev/null || git checkout HEAD -- cookies.txt 2>/dev/null || true
          git add --sparse -A -- downloads/
          
          if git diff --cached --quiet; then
            echo "No changes to commit"
          else
            git commit -m "CNS: Download \$(date -u +'%Y-%m-%d %H:%M:%S UTC')"
            git push origin HEAD:main
            echo "Committed and pushed"
          fi

      - name: Cleanup old downloads
        if: false
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
  githubRunId?: number;
  githubLiveStep?: string;
  submitKey?: string;
  dispatchAt?: string;
  runHint?: {
    afterTs: number;
    quality: string;
    format: string;
  };
  meta?: {
    title?: string;
    channel?: string;
    thumbnail?: string;
    duration?: string;
  };
}

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

type CookieHealth = {
  ok: boolean;
  reason?: string;
};

class GitHubClient {
  private config: GitHubConfig | null = null;
  private workflowEnsured = false;
  private getCache = new Map<string, { ts: number; etag?: string; data: unknown }>();
  private inFlightGet = new Map<string, Promise<any>>();
  private hotEndpointCache = new Map<string, { ts: number; data: any }>();
  private hotEndpointRefresh = new Map<string, Promise<any>>();
  private workflowEnsureTs = 0;
  private archiveContentCache = new Map<string, { ts: number; value: { content: string; sha: string } | null }>();
  private archiveContentInFlight = new Map<string, Promise<{ content: string; sha: string } | null>>();
  private commitTimeCache = new Map<string, { ts: number; value: string | null }>();
  private commitTimeInFlight = new Map<string, Promise<string | null>>();

  private getTauriInvoke():
    | ((command: string, payload?: Record<string, unknown>) => Promise<any>)
    | null {
    if (typeof window === 'undefined') return null;
    if (typeof window.__TAURI__?.invoke === 'function') return window.__TAURI__.invoke;
    if (typeof window.__TAURI_INVOKE__ === 'function') return window.__TAURI_INVOKE__;
    if (typeof window.__TAURI__?.tauri?.invoke === 'function') return window.__TAURI__.tauri.invoke;
    return null;
  }

  private isDesktopRuntime(): boolean {
    return this.getTauriInvoke() != null;
  }

  private cacheKey(path: string, options: RequestInit): string {
    const method = (options.method || 'GET').toUpperCase();
    return `${method}:${path}`;
  }

  private readGetCache(key: string): { etag?: string; data: unknown } | null {
    const entry = this.getCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > GET_CACHE_TTL_MS) {
      this.getCache.delete(key);
      return null;
    }
    return { etag: entry.etag, data: entry.data };
  }

  private writeGetCache(key: string, etag: string | null, data: unknown) {
    if (this.getCache.size >= MAX_GET_CACHE) {
      const firstKey = this.getCache.keys().next().value;
      if (firstKey) this.getCache.delete(firstKey);
    }
    this.getCache.set(key, { ts: Date.now(), etag: etag || undefined, data });
  }

  private inflightGetKey(tokenScope: string, path: string): string {
    return `${tokenScope}:${path}`;
  }

  private getHotCache<T>(key: string, ttlMs: number): T | null {
    const hit = this.hotEndpointCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.ts > ttlMs) return null;
    return hit.data as T;
  }

  private setHotCache(key: string, data: any) {
    this.hotEndpointCache.set(key, { ts: Date.now(), data });
  }

  async hydrateSecureConfig(): Promise<GitHubConfig | null> {
    const stored = storage.get('cns_github_config');
    if (!stored) return null;
    const parsed = safeJSONParse<unknown>(stored, null);
    if (!parsed || typeof parsed !== 'object') return null;
    const base = parsed as Record<string, unknown>;
    if (typeof base.owner !== 'string' || typeof base.repo !== 'string' || typeof base.token !== 'string') {
      return null;
    }
    if (base.token !== SECURE_TOKEN_PLACEHOLDER) {
      if (isValidConfig(parsed)) {
        this.config = parsed;
        return parsed;
      }
      return null;
    }
    let token: string | null = null;
    try {
      token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    } catch {
      token = null;
    }
    if (!token) {
      const invoke = this.getTauriInvoke();
      if (invoke) {
        try {
          const secureToken = await invoke('get_secure_github_token');
          if (typeof secureToken === 'string' && secureToken.length > 0) {
            token = secureToken;
            sessionStorage.setItem(SESSION_TOKEN_KEY, secureToken);
          }
        } catch {
        }
      }
    }
    if (!token) return null;
    const config: GitHubConfig = { token, owner: base.owner, repo: base.repo };
    this.config = config;
    return config;
  }

  setConfig(config: GitHubConfig) {
    if (!isValidConfig(config)) {
      logger.error('Invalid config object provided to setConfig', {
        hasOwner: typeof (config as GitHubConfig)?.owner === 'string',
        hasRepo: typeof (config as GitHubConfig)?.repo === 'string',
        hasToken: typeof (config as GitHubConfig)?.token === 'string',
      });
      return;
    }
    this.config = config;
    this.workflowEnsured = false;
    if (this.isDesktopRuntime()) {
      storage.set('cns_github_config', JSON.stringify({ owner: config.owner, repo: config.repo, token: SECURE_TOKEN_PLACEHOLDER }));
      try {
        sessionStorage.setItem(SESSION_TOKEN_KEY, config.token);
      } catch {
      }
      const invoke = this.getTauriInvoke();
      if (invoke) {
        void invoke('set_secure_github_token', { token: config.token }).catch(() => {});
      }
    } else {
      storage.set('cns_github_config', JSON.stringify(config));
    }
    logger.info('[GitHub] Config saved', { owner: config.owner, repo: config.repo });
  }

  getConfig(): GitHubConfig | null {
    if (this.config) return this.config;

    const stored = storage.get('cns_github_config');
    if (!stored) return null;

    const parsed = safeJSONParse<unknown>(stored, null);

    if (!isValidConfig(parsed)) {
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed as Record<string, unknown>).token === SECURE_TOKEN_PLACEHOLDER &&
        typeof (parsed as Record<string, unknown>).owner === 'string' &&
        typeof (parsed as Record<string, unknown>).repo === 'string'
      ) {
        let sessToken: string | null = null;
        try {
          sessToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
        } catch {
          sessToken = null;
        }
        if (sessToken && typeof sessToken === 'string') {
          const cfg: GitHubConfig = {
            owner: (parsed as Record<string, string>).owner,
            repo: (parsed as Record<string, string>).repo,
            token: sessToken,
          };
          this.config = cfg;
          return cfg;
        }
      }
      logger.error('[GitHub] Invalid or corrupted config found, clearing', {
        ownerType: typeof (parsed as Record<string, unknown>)?.owner,
        repoType: typeof (parsed as Record<string, unknown>)?.repo,
        tokenType: typeof (parsed as Record<string, unknown>)?.token,
      });
      storage.remove('cns_github_config');
      return null;
    }

    this.config = parsed;
    logger.info('[GitHub] Config loaded', { owner: parsed.owner, repo: parsed.repo });
    return this.config;
  }

  clearConfig() {
    this.config = null;
    this.workflowEnsured = false;
    storage.remove('cns_github_config');
    try {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    } catch {
    }
    const invoke = this.getTauriInvoke();
    if (invoke) {
      void invoke('clear_secure_github_token').catch(() => {});
    }
    logger.info('[GitHub] Config cleared');
  }

  getSupportSnapshot(): Record<string, unknown> {
    const c = this.getConfig();
    let cookiesSlot = false;
    let cookiesChars = 0;
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('cns_cookies') : null;
      if (raw) {
        cookiesSlot = true;
        cookiesChars = raw.length;
      }
    } catch {
    }
    return {
      configLoaded: !!c,
      owner: c?.owner ?? null,
      repo: c?.repo ?? null,
      repositoryFullName: c ? `${c.owner}/${c.repo}` : null,
      githubTokenConfigured: !!c?.token,
      githubTokenCharLength: c?.token ? c.token.length : 0,
      workflowEnsuredCache: this.workflowEnsured,
      cookiesTextSlotFilled: cookiesSlot,
      cookiesTextCharCount: cookiesChars,
      workflowFile: 'download.yml',
      apiBase: API_BASE,
    };
  }

  private async requestWithToken(token: string, path: string, options: RequestInit = {}, retries: number = 3): Promise<any> {
    const url = `${API_BASE}${path}`;
    const method = (options.method || 'GET').toUpperCase();
    const key = this.cacheKey(path, { ...options, method });
    const cached = method === 'GET' ? this.readGetCache(key) : null;
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${token}`,
      'User-Agent': 'CNS-YouTube-Downloader',
      ...(cached?.etag ? { 'If-None-Match': cached.etag } : {}),
      ...options.headers,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(url, { ...options, headers });

        if (response.status === 304 && cached) {
          return cached.data;
        }
        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
          const message = (typeof errorData.message === 'string' && errorData.message) || `HTTP ${response.status}`;
          logGithubApiHttpError('[GitHub API] HTTP error (token request)', {
            method: (options.method || 'GET').toUpperCase(),
            path,
            status: response.status,
            attempt: attempt + 1,
            requestId: response.headers.get('x-github-request-id'),
            githubMessage: typeof errorData.message === 'string' ? errorData.message : undefined,
            documentationUrl:
              typeof errorData.documentation_url === 'string' ? errorData.documentation_url : undefined,
            errors: errorData.errors,
          });

          if (response.status === 401) {
            throw new CNSError(`Authentication failed: ${message}`, ErrorCodes.AUTH_FAILED, false);
          }
          if (response.status === 403) {
            const isRateLimit = String(errorData.message ?? '').includes('rate limit');
            const resetRaw = response.headers.get('x-ratelimit-reset');
            const resetTs = resetRaw && /^\d+$/.test(resetRaw) ? Number(resetRaw) * 1000 : null;
            const retryHint =
              isRateLimit && resetTs
                ? ` Retry after ${new Date(resetTs).toISOString()}.`
                : '';
            throw new CNSError(
              isRateLimit ? `Rate limited: ${message}.${retryHint}` : `Forbidden: ${message}`,
              isRateLimit ? ErrorCodes.RATE_LIMITED : ErrorCodes.AUTH_FAILED,
              isRateLimit
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

        if (response.status === 204) {
          return null;
        }

        const data = await response.json();
        if (method === 'GET') {
          this.writeGetCache(key, response.headers.get('etag'), data);
        }
        return data;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (err instanceof CNSError && !err.retryable) {
          throw err;
        }

        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new CNSError('Request failed after retries', ErrorCodes.NETWORK_ERROR, false);
  }

  private async requestWithRetry(path: string, options: RequestInit = {}, retries: number = 3): Promise<any> {
    const config = this.getConfig();
    if (!config) throw new CNSError('GitHub config not set', ErrorCodes.CONFIG_MISSING, false);

    const url = `${API_BASE}${path}`;
    const method = (options.method || 'GET').toUpperCase();
    const key = this.cacheKey(path, { ...options, method });
    const cached = method === 'GET' ? this.readGetCache(key) : null;
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${config.token}`,
      'User-Agent': 'CNS-YouTube-Downloader',
      ...(cached?.etag ? { 'If-None-Match': cached.etag } : {}),
      ...options.headers,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(url, { ...options, headers });
        
        if (response.status === 304 && cached) {
          return cached.data;
        }
        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
          const message = (typeof errorData.message === 'string' && errorData.message) || `HTTP ${response.status}`;
          logGithubApiHttpError('[GitHub API] HTTP error (config request)', {
            method: (options.method || 'GET').toUpperCase(),
            path,
            status: response.status,
            attempt: attempt + 1,
            requestId: response.headers.get('x-github-request-id'),
            githubMessage: typeof errorData.message === 'string' ? errorData.message : undefined,
            documentationUrl:
              typeof errorData.documentation_url === 'string' ? errorData.documentation_url : undefined,
            errors: errorData.errors,
          });

          if (response.status === 401) {
            throw new CNSError(`Authentication failed: ${message}`, ErrorCodes.AUTH_FAILED, false);
          }
          if (response.status === 403) {
            const isRateLimit = String(errorData.message ?? '').includes('rate limit');
            const resetRaw = response.headers.get('x-ratelimit-reset');
            const resetTs = resetRaw && /^\d+$/.test(resetRaw) ? Number(resetRaw) * 1000 : null;
            const retryHint =
              isRateLimit && resetTs
                ? ` Retry after ${new Date(resetTs).toISOString()}.`
                : '';
            throw new CNSError(
              isRateLimit ? `Rate limited: ${message}.${retryHint}` : `Forbidden: ${message}`,
              isRateLimit ? ErrorCodes.RATE_LIMITED : ErrorCodes.AUTH_FAILED,
              isRateLimit
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

        if (response.status === 204) {
          return null;
        }

        const data = await response.json();
        if (method === 'GET') {
          this.writeGetCache(key, response.headers.get('etag'), data);
        }
        return data;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (err instanceof CNSError && !err.retryable) {
          throw err;
        }

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

  private async requestCoalesced(path: string, tokenScope: string): Promise<any> {
    const key = this.inflightGetKey(tokenScope, path);
    const existing = this.inFlightGet.get(key);
    if (existing) return existing;
    const p = this.request(path).finally(() => {
      this.inFlightGet.delete(key);
    });
    this.inFlightGet.set(key, p);
    return p;
  }

  async triggerWorkflow(url: string, quality: string, format: string): Promise<number> {
    const config = this.getConfig();
    if (!config) throw new CNSError('GitHub config not set', ErrorCodes.CONFIG_MISSING, false);

    if (!this.workflowEnsured || Date.now() - this.workflowEnsureTs > 120000) {
      await this.ensureWorkflow(config.token, config.owner, config.repo);
      this.workflowEnsured = true;
      this.workflowEnsureTs = Date.now();
    }

    let targetHost = '';
    try {
      targetHost = new URL(url).hostname;
    } catch {
      throw new CNSError('Invalid URL format', ErrorCodes.INVALID_URL, false);
    }

    logger.info('[GitHub] Workflow dispatch requested', {
      owner: config.owner,
      repo: config.repo,
      targetHost,
      quality,
      format,
    });

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
        const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const message = (typeof errorData.message === 'string' && errorData.message) || `HTTP ${response.status}`;
        logGithubApiHttpError('[GitHub API] workflow dispatch HTTP error', {
          method: 'POST',
          path: `/repos/${config.owner}/${config.repo}/actions/workflows/download.yml/dispatches`,
          status: response.status,
          requestId: response.headers.get('x-github-request-id'),
          githubMessage: typeof errorData.message === 'string' ? errorData.message : undefined,
          documentationUrl:
            typeof errorData.documentation_url === 'string' ? errorData.documentation_url : undefined,
          errors: errorData.errors,
        });

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

      logger.info('[GitHub] Workflow dispatch accepted', {
        owner: config.owner,
        repo: config.repo,
        httpStatus: response.status,
        targetHost,
        quality,
        format,
      });
      return response.status;
    } catch (err) {
      logger.error('[GitHub] Workflow dispatch failed', {
        error: err,
        owner: config.owner,
        repo: config.repo,
        targetHost,
        quality,
        format,
      });
      if (err instanceof CNSError) throw err;
      throw new CNSError(`Network error: ${err instanceof Error ? err.message : 'Unknown error'}`, ErrorCodes.NETWORK_ERROR, true);
    }
  }

  private async triggerWorkflowWithTimeout(
    url: string,
    quality: string,
    format: string,
    timeoutMs: number
  ): Promise<number> {
    const run = this.triggerWorkflow(url, quality, format);
    let timer = 0;
    const timeout = new Promise<number>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error('Dispatch timeout')), timeoutMs);
    });
    try {
      return await Promise.race([run, timeout]);
    } finally {
      window.clearTimeout(timer);
    }
  }

  async triggerWorkflowFast(
    url: string,
    quality: string,
    format: string
  ): Promise<{ status: number; dispatchAt: string; runHint: { afterTs: number; quality: string; format: string } }> {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const status = await this.triggerWorkflowWithTimeout(url, quality, format, 12000);
        const now = Date.now();
        return {
          status,
          dispatchAt: new Date(now).toISOString(),
          runHint: { afterTs: now - 5000, quality, format },
        };
      } catch (err) {
        lastErr = err;
        if (attempt < 2) {
          const wait = 260 + Math.floor(Math.random() * 440) + attempt * 300;
          await new Promise((resolve) => setTimeout(resolve, wait));
        }
      }
    }
    throw (lastErr instanceof Error ? lastErr : new Error('Workflow dispatch failed'));
  }

  async getWorkflowRuns(): Promise<any[]> {
    const config = this.getConfig();
    if (!config) throw new Error('GitHub config not set');
    const endpointKey = `runs:${config.owner}/${config.repo}`;
    const path = `/repos/${config.owner}/${config.repo}/actions/runs?workflow_id=download.yml&per_page=25`;
    const tokenScope = `${config.owner}/${config.repo}`;
    const cached = this.getHotCache<any[]>(endpointKey, 2500);
    if (cached) {
      if (!this.hotEndpointRefresh.has(endpointKey)) {
        const refresh = this.requestCoalesced(path, tokenScope)
          .then((data) => {
            const runs = data.workflow_runs || [];
            this.setHotCache(endpointKey, runs);
            return runs;
          })
          .finally(() => this.hotEndpointRefresh.delete(endpointKey));
        this.hotEndpointRefresh.set(endpointKey, refresh);
      }
      return cached;
    }

    try {
      const data = await this.requestCoalesced(path, tokenScope);
      const runs = data.workflow_runs || [];
      this.setHotCache(endpointKey, runs);
      return runs;
    } catch (err) {
      logger.warn('[GitHub] getWorkflowRuns failed', {
        error: err,
        owner: config.owner,
        repo: config.repo,
      });
      throw err;
    }
  }

  async getWorkflowRunJobs(runId: number): Promise<any[]> {
    const config = this.getConfig();
    if (!config) throw new Error('GitHub config not set');
    const endpointKey = `runjobs:${config.owner}/${config.repo}:${runId}`;
    const path = `/repos/${config.owner}/${config.repo}/actions/runs/${runId}/jobs?per_page=100`;
    const tokenScope = `${config.owner}/${config.repo}`;
    const cached = this.getHotCache<any[]>(endpointKey, 2200);
    if (cached) {
      if (!this.hotEndpointRefresh.has(endpointKey)) {
        const refresh = this.requestCoalesced(path, tokenScope)
          .then((data) => {
            const jobs = data.jobs || [];
            this.setHotCache(endpointKey, jobs);
            return jobs;
          })
          .finally(() => this.hotEndpointRefresh.delete(endpointKey));
        this.hotEndpointRefresh.set(endpointKey, refresh);
      }
      return cached;
    }

    const data = await this.requestCoalesced(path, tokenScope);
    const jobs = data.jobs || [];
    this.setHotCache(endpointKey, jobs);
    return jobs;
  }

  async getJobLogsText(jobId: number): Promise<string | null> {
    const config = this.getConfig();
    if (!config) return null;
    const url = `${API_BASE}/repos/${config.owner}/${config.repo}/actions/jobs/${jobId}/logs`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `token ${config.token}`,
          'User-Agent': 'CNS-YouTube-Downloader',
        },
        redirect: 'follow',
      });
      if (!response.ok) {
        logger.warn('[GitHub] getJobLogsText HTTP error', {
          jobId,
          status: response.status,
          path: `/repos/${config.owner}/${config.repo}/actions/jobs/${jobId}/logs`,
          requestId: response.headers.get('x-github-request-id'),
        });
        return null;
      }
      const text = await response.text();
      if (!text || text.length < 4) return null;
      const cap = 400000;
      return text.length > cap ? text.slice(-cap) : text;
    } catch (err) {
      logger.warn('[GitHub] getJobLogsText failed', { jobId, error: err });
      return null;
    }
  }

  async getDownloads(): Promise<any[]> {
    const config = this.getConfig();
    if (!config) throw new Error('GitHub config not set');
    const endpointKey = `downloads:${config.owner}/${config.repo}`;
    const path = `/repos/${config.owner}/${config.repo}/contents/downloads`;
    const tokenScope = `${config.owner}/${config.repo}`;
    const cached = this.getHotCache<any[]>(endpointKey, 2500);
    if (cached) {
      if (!this.hotEndpointRefresh.has(endpointKey)) {
        const refresh = this.requestCoalesced(path, tokenScope)
          .then((data) => {
            const list = Array.isArray(data) ? data : [];
            this.setHotCache(endpointKey, list);
            return list;
          })
          .finally(() => this.hotEndpointRefresh.delete(endpointKey));
        this.hotEndpointRefresh.set(endpointKey, refresh);
      }
      return cached;
    }

    try {
      const data = await this.requestCoalesced(path, tokenScope);
      const list = Array.isArray(data) ? data : [];
      this.setHotCache(endpointKey, list);
      return list;
    } catch (err) {
      logger.warn('[GitHub] downloads listing failed', {
        error: err,
        owner: config.owner,
        repo: config.repo,
        path: `/repos/${config.owner}/${config.repo}/contents/downloads`,
      });
      return [];
    }
  }

  async getFileCommitTime(path: string): Promise<string | null> {
    const config = this.getConfig();
    if (!config) return null;
    const key = `${config.owner}/${config.repo}:${path}`;
    const cached = this.commitTimeCache.get(key);
    if (cached && Date.now() - cached.ts < 20_000) {
      return cached.value;
    }
    const inFlight = this.commitTimeInFlight.get(key);
    if (inFlight) return inFlight;
    const load = (async () => {
      try {
        const data = await this.request(
          `/repos/${config.owner}/${config.repo}/commits?path=${encodeURIComponent(path)}&per_page=1`
        );
        let v: string | null = null;
        if (Array.isArray(data) && data.length > 0) {
          v = data[0]?.commit?.committer?.date ?? data[0]?.commit?.author?.date ?? null;
        }
        this.commitTimeCache.set(key, { ts: Date.now(), value: v });
        return v;
      } catch {
        this.commitTimeCache.set(key, { ts: Date.now(), value: null });
        return null;
      } finally {
        this.commitTimeInFlight.delete(key);
      }
    })();
    this.commitTimeInFlight.set(key, load);
    return load;
  }

  private async downloadBlobWithTimeout(url: string, headers: Record<string, string>, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        headers,
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timer);
    }
  }

  async downloadFileAsBlob(sha: string, path?: string): Promise<Blob> {
    const config = this.getConfig();
    if (!config) throw new Error('GitHub config not set');
    const headers = {
      Authorization: `token ${config.token}`,
      Accept: 'application/vnd.github.raw',
      'User-Agent': 'CNS-YouTube-Downloader',
    };

    const blobPath = `/repos/${config.owner}/${config.repo}/git/blobs/${sha}`;
    let response: Response | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await this.downloadBlobWithTimeout(`${API_BASE}${blobPath}`, headers, 45000);
        break;
      } catch (err) {
        lastError = err;
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
    if (!response) {
      throw new Error(lastError instanceof Error ? lastError.message : 'Download request timed out');
    }

    if (!response.ok && path) {
      const contentPath = `/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
      const fallback = await this.downloadBlobWithTimeout(`${API_BASE}${contentPath}`, headers, 45000);
      if (fallback.ok) {
        response = fallback;
      } else {
        logGithubApiHttpError('[GitHub API] blob download fallback HTTP error', {
          method: 'GET',
          path: contentPath,
          status: fallback.status,
          requestId: fallback.headers.get('x-github-request-id'),
          errors: { shaPrefix: sha.slice(0, 8), filePath: path },
        });
      }
    }

    if (!response.ok) {
      logGithubApiHttpError('[GitHub API] blob download HTTP error', {
        method: 'GET',
        path: blobPath,
        status: response.status,
        requestId: response.headers.get('x-github-request-id'),
        errors: { shaPrefix: sha.slice(0, 8), filePath: path },
      });
      throw new Error(`Download failed: HTTP ${response.status}`);
    }
    return response.blob();
  }

  async preflightDownload(path: string): Promise<{ ok: boolean; reason?: string }> {
    const config = this.getConfig();
    if (!config) return { ok: false, reason: 'GitHub config not set' };
    try {
      const data = await this.request(
        `/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`
      );
      if (!data || typeof data !== 'object') return { ok: false, reason: 'File metadata unavailable' };
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: msg };
    }
  }

  async downloadFileViaNative(path: string, fileName: string): Promise<string | null> {
    const config = this.getConfig();
    if (!config) return null;
    const invoke = this.getTauriInvoke();
    if (!invoke) return null;
    try {
      const out = await invoke('download_github_file', {
        owner: config.owner,
        repo: config.repo,
        token: config.token,
        path,
        fileName,
      });
      return typeof out === 'string' && out.length > 0 ? out : null;
    } catch {
      return null;
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
    const key = `${config.owner}/${config.repo}:${path}`;
    const cached = this.archiveContentCache.get(key);
    if (cached && Date.now() - cached.ts < 25_000) {
      return cached.value;
    }
    const inFlight = this.archiveContentInFlight.get(key);
    if (inFlight) return inFlight;
    const load = (async () => {
      try {
        const data = await this.request(
          `/repos/${config.owner}/${config.repo}/contents/${path}`
        );
        const base64Content = data.content.replace(/\s/g, '');
        const binaryString = atob(base64Content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const content = new TextDecoder('utf-8').decode(bytes);
        const value = { content, sha: data.sha };
        this.archiveContentCache.set(key, { ts: Date.now(), value });
        return value;
      } catch (err) {
        const msg = err instanceof Error ? err.message.toLowerCase() : '';
        if (msg.includes('not found') || msg.includes('404') || msg.includes('409')) {
          this.archiveContentCache.set(key, { ts: Date.now(), value: null });
        }
        return null;
      } finally {
        this.archiveContentInFlight.delete(key);
      }
    })();
    this.archiveContentInFlight.set(key, load);
    return load;
  }

  async connectExistingRepo(token: string, repoName: string = 'cns-downloads'): Promise<GitHubConfig> {
    const user = await this.requestWithToken(token, '/user');
    await this.requestWithToken(token, `/repos/${user.login}/${repoName}`);

    const config: GitHubConfig = { token, owner: user.login, repo: repoName };
    this.setConfig(config);
    return config;
  }

  async ensureWorkflow(token: string, owner: string, repo: string): Promise<void> {
    try {
      const existing = await this.requestWithToken(token, `/repos/${owner}/${repo}/contents/.github/workflows/download.yml`);
      await this.setupWorkflow(token, owner, repo, existing?.sha);
    } catch (err) {
      if (err instanceof CNSError && err.code === ErrorCodes.REPO_NOT_FOUND) {
        await this.setupWorkflow(token, owner, repo);
        return;
      }
      throw err;
    }
  }

  // Auto-setup: Create repo and workflow file
  async createRepo(name: string, token: string): Promise<{ owner: string; repo: string; created: boolean }> {
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
      if (response.status === 409 || response.status === 422) {
        const user = await this.requestWithToken(token, '/user');
        try {
          await this.requestWithToken(token, `/repos/${user.login}/${name}`);
          return { owner: user.login, repo: name, created: false };
        } catch {
        }
      }
      throw new Error(error.message || `Failed to create repo: HTTP ${response.status}`);
    }

    const data = await response.json();
    return { owner: data.owner.login, repo: data.name, created: true };
  }

  async setupWorkflow(token: string, owner: string, repo: string, sha?: string): Promise<void> {
    const path = '.github/workflows/download.yml';
    const content = btoa(WORKFLOW_YML);
    const body: Record<string, string> = {
      message: sha ? 'CNS: Update download workflow safety' : 'CNS: Initialize download workflow',
      content,
    };
    if (sha) body.sha = sha;
    
    const response = await fetch(`${API_BASE}/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'CNS-YouTube-Downloader',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (response.status === 422 && String(error.message || '').toLowerCase().includes('unchanged')) {
        return;
      }
      throw new Error(error.message || `Failed to setup workflow: HTTP ${response.status}`);
    }
  }

  async autoSetup(token: string, repoName: string = 'cns-downloads'): Promise<{ config: GitHubConfig; repoCreated: boolean }> {
    // Step 1: Create repo
    const { owner, repo, created } = await this.createRepo(repoName, token);
    
    // Step 2: Setup workflow
    if (created) {
      await this.setupWorkflow(token, owner, repo);
    } else {
      await this.ensureWorkflow(token, owner, repo);
    }
    
    // Step 3: Save config
    const config: GitHubConfig = { token, owner, repo };
    this.setConfig(config);
    
    return { config, repoCreated: created };
  }

  // Cookies management
  getCookies(): string | null {
    return storage.get('cns_cookies');
  }

  assessCookieText(cookiesContent: string): CookieHealth {
    const lines = cookiesContent.split(/\r?\n/);
    const nowSec = Math.floor(Date.now() / 1000);
    let hasCookieRows = false;
    let hasLiveAuthCookie = false;
    const authNames = new Set([
      'sid',
      'hsid',
      'ssid',
      'apisid',
      'sapISID'.toLowerCase(),
      '__secure-1psid',
      '__secure-3psid',
      '__secure-1psidts',
      '__secure-3psidts',
      'login_info',
    ]);

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const parts = line.split('\t');
      if (parts.length < 7) continue;
      hasCookieRows = true;
      const domain = (parts[0] || '').toLowerCase();
      const expiry = Number(parts[4] || 0);
      const name = (parts[5] || '').toLowerCase();
      const isYoutubeDomain = domain.includes('youtube.com') || domain.includes('google.com');
      if (!isYoutubeDomain) continue;
      if (!authNames.has(name)) continue;
      const live = !Number.isFinite(expiry) || expiry <= 0 || expiry > nowSec;
      if (live) {
        hasLiveAuthCookie = true;
        break;
      }
    }

    if (!hasCookieRows) {
      return { ok: false, reason: 'COOKIE_FORMAT_INVALID' };
    }
    if (!hasLiveAuthCookie) {
      return { ok: false, reason: 'COOKIE_EXPIRED_LOCAL' };
    }
    return { ok: true };
  }

  assessStoredCookies(): CookieHealth {
    const content = this.getCookies();
    if (!content || !content.trim()) return { ok: true };
    return this.assessCookieText(content);
  }

  clearCookies(): void {
    storage.remove('cns_cookies');
    logger.info('[GitHub] Cookies cleared');
  }

  async uploadCookies(cookiesContent: string): Promise<void> {
    const config = this.getConfig();
    if (!config) throw new Error('GitHub config not set');

    const content = utf8ToBase64GitHub(cookiesContent);
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
      const error = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      logGithubApiHttpError('[GitHub API] cookies upload HTTP error', {
        method: 'PUT',
        path: `/repos/${config.owner}/${config.repo}/contents/cookies.txt`,
        status: response.status,
        requestId: response.headers.get('x-github-request-id'),
        githubMessage: typeof error.message === 'string' ? error.message : undefined,
        documentationUrl: typeof error.documentation_url === 'string' ? error.documentation_url : undefined,
      });
      throw new Error(
        (typeof error.message === 'string' && error.message) || `Failed to upload cookies: HTTP ${response.status}`
      );
    }
  }
}

export const github = new GitHubClient();
