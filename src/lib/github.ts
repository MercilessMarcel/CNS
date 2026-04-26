const API_BASE = 'https://api.github.com';

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
}

export const github = new GitHubClient();
