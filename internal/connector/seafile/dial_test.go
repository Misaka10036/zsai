package seafile

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDialAllowlistedRejectsOffHost(t *testing.T) {
	client := DialAllowlisted([]string{"seafile.example.com"}, 0)
	req, err := http.NewRequest(http.MethodGet, "https://evil.example/x", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.Transport.RoundTrip(req); err == nil {
		t.Fatal("expected allowlist error")
	}
}

func TestDialAllowlistedRejectsMappedMetadataIP(t *testing.T) {
	client := DialAllowlisted([]string{"seafile.example.com"}, 0)
	req, err := http.NewRequest(http.MethodGet, "http://[::ffff:169.254.169.254]/latest", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.Transport.RoundTrip(req); err == nil {
		t.Fatal("expected mapped ipv4 metadata host to be rejected")
	}
}

func TestDialAllowlistedPrivateConfiguredHost(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)
	host := srv.Listener.Addr().String()
	// httptest host is 127.0.0.1:port — allow the hostname only.
	req, err := http.NewRequest(http.MethodGet, srv.URL, nil)
	if err != nil {
		t.Fatal(err)
	}
	client := DialAllowlisted([]string{req.URL.Hostname()}, 0)
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("configured private host should be allowed: %v", err)
	}
	resp.Body.Close()
	_ = host
}
