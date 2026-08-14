package seafile

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// Client talks to SeaFile api2 / via-repo-token endpoints.
type Client struct {
	BaseURL    string
	Token      string
	RepoToken  string
	HTTP       *http.Client
	Allowed    []string
	Timeout    time.Duration
}

func rewriteBaseURL(baseURL string) (string, []string) {
	baseURL = strings.TrimRight(baseURL, "/")
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Hostname() == "" {
		return baseURL, nil
	}
	hosts := []string{parsed.Hostname()}
	if !strings.EqualFold(parsed.Hostname(), "host.docker.internal") {
		return baseURL, hosts
	}
	if _, err := os.Stat("/.dockerenv"); err == nil {
		return baseURL, hosts
	}
	if parsed.Port() != "" {
		parsed.Host = "127.0.0.1:" + parsed.Port()
	} else {
		parsed.Host = "127.0.0.1"
	}
	hosts = append(hosts, "127.0.0.1", "localhost")
	return strings.TrimRight(parsed.String(), "/"), hosts
}

func NewClient(baseURL, token, repoToken string, extraHosts []string) *Client {
	rewritten, rewriteHosts := rewriteBaseURL(baseURL)
	hosts := append([]string{}, extraHosts...)
	hosts = append(hosts, rewriteHosts...)
	if u, err := url.Parse(rewritten); err == nil && u.Hostname() != "" {
		hosts = append(hosts, u.Hostname())
	}
	baseURL = rewritten
	return &Client{
		BaseURL:   baseURL,
		Token:     token,
		RepoToken: repoToken,
		Allowed:   hosts,
		Timeout:   60 * time.Second,
		HTTP:      DialAllowlisted(hosts, 60*time.Second),
	}
}

func (c *Client) accountGet(endpoint string, query url.Values) (*http.Response, error) {
	if c.Token == "" {
		return nil, fmt.Errorf("seafile: account token not set")
	}
	reqURL := c.BaseURL + "/api2/" + strings.TrimLeft(endpoint, "/")
	if query != nil {
		reqURL += "?" + query.Encode()
	}
	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Token "+c.Token)
	req.Header.Set("Accept", "application/json")
	return c.HTTP.Do(req)
}

func (c *Client) repoGet(endpoint string, query url.Values) (*http.Response, error) {
	if c.RepoToken == "" {
		return nil, fmt.Errorf("seafile: repo token not set")
	}
	reqURL := c.BaseURL + "/api/v2.1/via-repo-token/" + strings.TrimLeft(endpoint, "/")
	if query != nil {
		reqURL += "?" + query.Encode()
	}
	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.RepoToken)
	req.Header.Set("Accept", "application/json")
	return c.HTTP.Do(req)
}

// DirEntry is a SeaFile directory listing item.
type DirEntry struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Type  string `json:"type"`
	Size  int64  `json:"size"`
	Mtime any    `json:"mtime"`
}

func (c *Client) ListLibraries() ([]map[string]any, error) {
	resp, err := c.accountGet("repos/", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("seafile: list libraries %s: %s", resp.Status, body)
	}
	var libraries []map[string]any
	if err := json.Unmarshal(body, &libraries); err != nil {
		return nil, err
	}
	return libraries, nil
}

func (c *Client) ListDir(repoID, path string) ([]DirEntry, error) {
	if path == "" {
		path = "/"
	}
	var resp *http.Response
	var err error
	if c.RepoToken != "" {
		resp, err = c.repoGet("dir/", url.Values{"path": {path}})
	} else {
		resp, err = c.accountGet("repos/"+repoID+"/dir/", url.Values{"p": {path}})
	}
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("seafile: list dir %s: %s", resp.Status, body)
	}
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var wrapped struct {
		DirentList []DirEntry `json:"dirent_list"`
	}
	if err := json.Unmarshal(raw, &wrapped); err == nil && wrapped.DirentList != nil {
		return wrapped.DirentList, nil
	}
	var entries []DirEntry
	if err := json.Unmarshal(raw, &entries); err != nil {
		return nil, err
	}
	return entries, nil
}

func (c *Client) DownloadLink(repoID, path string) (string, error) {
	var resp *http.Response
	var err error
	if c.RepoToken != "" {
		resp, err = c.repoGet("download-link/", url.Values{"path": {path}})
	} else {
		resp, err = c.accountGet("repos/"+repoID+"/file/", url.Values{"p": {path}, "reuse": {"1"}})
	}
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("seafile: download-link %s: %s", resp.Status, body)
	}
	return strings.Trim(strings.TrimSpace(string(body)), `"`), nil
}

func (c *Client) Download(link string) ([]byte, error) {
	req, err := http.NewRequest(http.MethodGet, link, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("seafile: download %s", resp.Status)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 2<<20))
}
