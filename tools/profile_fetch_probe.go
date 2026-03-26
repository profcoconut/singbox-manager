package main

import (
	"context"
	"crypto/tls"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptrace"
	"net/url"
	"os"
	"strings"
	"time"
)

func main() {
	target := flag.String("url", "", "Target URL to fetch")
	dnsServer := flag.String("dns", "1.1.1.1:53", "DNS server for custom resolver")
	timeout := flag.Duration("timeout", 10*time.Second, "Request timeout")
	flag.Parse()

	if *target == "" {
		fmt.Fprintln(os.Stderr, "missing -url")
		os.Exit(2)
	}

	parsed, err := url.Parse(*target)
	if err != nil {
		fmt.Fprintf(os.Stderr, "invalid url: %v\n", err)
		os.Exit(2)
	}

	modes := []probeMode{
		{name: "default-system", network: "tcp", resolver: nil},
		{name: "tcp4-system", network: "tcp4", resolver: nil},
		{name: "tcp6-system", network: "tcp6", resolver: nil},
		{name: "default-publicdns", network: "tcp", resolver: publicResolver(*dnsServer)},
		{name: "tcp4-publicdns", network: "tcp4", resolver: publicResolver(*dnsServer)},
		{name: "tcp6-publicdns", network: "tcp6", resolver: publicResolver(*dnsServer)},
	}

	for _, mode := range modes {
		runProbe(parsed, mode, *timeout)
	}
}

type probeMode struct {
	name     string
	network  string
	resolver *net.Resolver
}

func publicResolver(server string) *net.Resolver {
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	return &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			return dialer.DialContext(ctx, "udp", server)
		},
	}
}

func runProbe(parsed *url.URL, mode probeMode, timeout time.Duration) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	dialer := &net.Dialer{
		Timeout:  timeout,
		Resolver: mode.resolver,
	}

	var remoteAddr string
	trace := &httptrace.ClientTrace{
		GotConn: func(info httptrace.GotConnInfo) {
			if info.Conn != nil {
				remoteAddr = info.Conn.RemoteAddr().String()
			}
		},
	}

	req, err := http.NewRequestWithContext(httptrace.WithClientTrace(ctx, trace), http.MethodGet, parsed.String(), nil)
	if err != nil {
		fmt.Printf("[%s] request error: %v\n", mode.name, err)
		return
	}

	transport := &http.Transport{
		Proxy: nil,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			return dialer.DialContext(ctx, mode.network, address)
		},
		TLSClientConfig: &tls.Config{
			ServerName: strings.Split(parsed.Host, ":")[0],
		},
		ForceAttemptHTTP2:     true,
		DisableKeepAlives:     true,
		TLSHandshakeTimeout:   timeout,
		ResponseHeaderTimeout: timeout,
		ExpectContinueTimeout: timeout,
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   timeout,
	}

	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("[%s] error after %s: %v\n", mode.name, time.Since(start).Round(time.Millisecond), err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 128))
	fmt.Printf("[%s] status=%d remote=%s elapsed=%s body_prefix=%q\n",
		mode.name,
		resp.StatusCode,
		remoteAddr,
		time.Since(start).Round(time.Millisecond),
		string(body),
	)
}
