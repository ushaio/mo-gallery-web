package services

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"mo-gallery-desktop/config"
)

// InspirationSubscription is a locally stored RSS/Atom source. Keeping the
// list local makes the desktop inspiration workspace useful offline and avoids
// adding a new cloud schema just for feed preferences.
type InspirationSubscription struct {
	ID          string    `json:"id"`
	URL         string    `json:"url"`
	Title       string    `json:"title"`
	SiteURL     string    `json:"siteUrl,omitempty"`
	Description string    `json:"description,omitempty"`
	AddedAt     time.Time `json:"addedAt"`
	LastFetched time.Time `json:"lastFetched,omitempty"`
	LastError   string    `json:"lastError,omitempty"`
}

type InspirationFeedItem struct {
	ID            string    `json:"id"`
	FeedID        string    `json:"feedId"`
	FeedTitle     string    `json:"feedTitle"`
	Title         string    `json:"title"`
	URL           string    `json:"url"`
	Summary       string    `json:"summary,omitempty"`
	Author        string    `json:"author,omitempty"`
	PublishedAt   time.Time `json:"publishedAt,omitempty"`
	ImageURL      string    `json:"imageUrl,omitempty"`
	SourceSiteURL string    `json:"sourceSiteUrl,omitempty"`
}

type InspirationService struct {
	mu            sync.Mutex
	path          string
	subscriptions []InspirationSubscription
}

func NewInspirationService() *InspirationService {
	s := &InspirationService{path: filepath.Join(config.ConfigDir(), "inspiration-feeds.json")}
	_ = s.load()
	return s
}

func (s *InspirationService) load() error {
	data, err := osReadFile(s.path)
	if err != nil {
		if errors.Is(err, errFileNotFound) {
			return nil
		}
		return err
	}
	return json.Unmarshal(data, &s.subscriptions)
}

func (s *InspirationService) save() error {
	data, err := json.MarshalIndent(s.subscriptions, "", "  ")
	if err != nil {
		return err
	}
	return osWriteFile(s.path, data)
}

// ListSubscriptions returns the saved sources without doing network work.
func (s *InspirationService) ListSubscriptions() []InspirationSubscription {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.subscriptions) == 0 {
		return []InspirationSubscription{}
	}
	return append([]InspirationSubscription{}, s.subscriptions...)
}

// Subscribe discovers an RSS/Atom endpoint from a feed URL or a normal site
// URL, then stores the canonical endpoint. This supports MO Gallery sites as
// well as WordPress, Ghost, Hugo and other blogs exposing standard feed links.
func (s *InspirationService) Subscribe(rawURL string) (*InspirationSubscription, error) {
	feedURL, title, siteURL, description, err := discoverFeed(rawURL)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.subscriptions {
		if s.subscriptions[i].URL == feedURL {
			return &s.subscriptions[i], nil
		}
	}
	now := time.Now()
	item := InspirationSubscription{ID: stableFeedID(feedURL), URL: feedURL, Title: title, SiteURL: siteURL, Description: description, AddedAt: now}
	s.subscriptions = append(s.subscriptions, item)
	if err := s.save(); err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *InspirationService) Unsubscribe(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.subscriptions {
		if s.subscriptions[i].ID == id {
			s.subscriptions = append(s.subscriptions[:i], s.subscriptions[i+1:]...)
			return s.save()
		}
	}
	return fmt.Errorf("订阅不存在: %s", id)
}

// Refresh fetches all subscriptions. One failing source does not hide healthy
// sources; its error is retained on the subscription for the UI to explain.
func (s *InspirationService) Refresh() ([]InspirationFeedItem, error) {
	s.mu.Lock()
	sources := append([]InspirationSubscription(nil), s.subscriptions...)
	s.mu.Unlock()
	items := make([]InspirationFeedItem, 0)
	var firstErr error
	for _, source := range sources {
		feed, err := fetchFeed(source.URL)
		if err != nil {
			// Older builds could save a homepage before feed discovery was added.
			// Re-discover it on refresh and transparently migrate the saved URL.
			if canonical, title, siteURL, description, discoverErr := discoverFeed(firstFeedValue(source.SiteURL, source.URL)); discoverErr == nil && canonical != source.URL {
				feed, err = fetchFeed(canonical)
				if err == nil {
					source.URL, source.Title, source.SiteURL, source.Description = canonical, title, siteURL, description
				}
			}
		}
		s.mu.Lock()
		for i := range s.subscriptions {
			if s.subscriptions[i].ID == source.ID {
				s.subscriptions[i].URL = source.URL
				if source.Title != "" {
					s.subscriptions[i].Title = source.Title
				}
				if source.SiteURL != "" {
					s.subscriptions[i].SiteURL = source.SiteURL
				}
				if source.Description != "" {
					s.subscriptions[i].Description = source.Description
				}
				s.subscriptions[i].LastFetched = time.Now()
				if err != nil {
					s.subscriptions[i].LastError = err.Error()
				} else {
					s.subscriptions[i].LastError = ""
				}
				break
			}
		}
		_ = s.save()
		s.mu.Unlock()
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		for i := range feed {
			feed[i].FeedID = source.ID
			feed[i].FeedTitle = source.Title
			feed[i].SourceSiteURL = source.SiteURL
		}
		items = append(items, feed...)
	}
	if firstErr != nil && len(items) == 0 {
		return items, firstErr
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].PublishedAt.After(items[j].PublishedAt) })
	if len(items) > 100 {
		items = items[:100]
	}
	return items, nil
}

type rssDocument struct {
	Channel struct {
		Title       string    `xml:"title"`
		Link        string    `xml:"link"`
		Description string    `xml:"description"`
		Items       []rssItem `xml:"item"`
	} `xml:"channel"`
	Entries []atomEntry `xml:"entry"`
}
type rssItem struct {
	GUID        string        `xml:"guid"`
	Title       string        `xml:"title"`
	Link        string        `xml:"link"`
	Description string        `xml:"description"`
	Author      string        `xml:"author"`
	PubDate     string        `xml:"pubDate"`
	Content     string        `xml:"encoded"`
	Enclosure   *rssEnclosure `xml:"enclosure"`
}
type rssEnclosure struct {
	URL  string `xml:"url,attr"`
	Type string `xml:"type,attr"`
}
type atomDocument struct {
	Title    string      `xml:"title"`
	Link     []atomLink  `xml:"link"`
	Subtitle string      `xml:"subtitle"`
	Entries  []atomEntry `xml:"entry"`
}
type atomEntry struct {
	ID        string     `xml:"id"`
	Title     string     `xml:"title"`
	Summary   string     `xml:"summary"`
	Updated   string     `xml:"updated"`
	Published string     `xml:"published"`
	Author    string     `xml:"author"`
	Content   string     `xml:"content"`
	Link      []atomLink `xml:"link"`
}
type atomLink struct {
	Href string `xml:"href,attr"`
	Rel  string `xml:"rel,attr"`
	Type string `xml:"type,attr"`
}

func fetchFeed(feedURL string) ([]InspirationFeedItem, error) {
	resp, err := httpClient().Get(feedURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("feed returned HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	var rss rssDocument
	if err := xml.Unmarshal(body, &rss); err == nil && (rss.Channel.Title != "" || len(rss.Channel.Items) > 0) {
		items := make([]InspirationFeedItem, 0, len(rss.Channel.Items))
		for _, item := range rss.Channel.Items {
			itemURL := resolveFeedURL(feedURL, item.Link)
			items = append(items, InspirationFeedItem{ID: stableFeedID(item.GUID + itemURL), Title: cleanText(item.Title), URL: itemURL, Summary: cleanText(firstFeedValue(item.Description, item.Content)), Author: cleanText(item.Author), PublishedAt: parseFeedTime(item.PubDate), ImageURL: resolveFeedURL(feedURL, enclosureImage(item.Enclosure))})
		}
		return items, nil
	}
	var atom atomDocument
	if err := xml.Unmarshal(body, &atom); err != nil {
		return nil, fmt.Errorf("parse RSS/Atom: %w", err)
	}
	items := make([]InspirationFeedItem, 0, len(atom.Entries))
	for _, entry := range atom.Entries {
		entryURL := resolveFeedURL(feedURL, entryTitleLink(entry))
		items = append(items, InspirationFeedItem{ID: stableFeedID(entry.ID + entryURL), Title: cleanText(entry.Title), URL: entryURL, Summary: cleanText(firstFeedValue(entry.Summary, entry.Content)), Author: cleanText(entry.Author), PublishedAt: parseFeedTime(firstFeedValue(entry.Published, entry.Updated))})
	}
	return items, nil
}

func discoverFeed(rawURL string) (string, string, string, string, error) {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", "", "", "", errors.New("请输入有效的 http(s) 地址")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", "", "", "", errors.New("仅支持 http(s) 订阅地址")
	}
	// A feed URL is often entered directly. Try parsing it first so a site
	// homepage that intentionally returns 404 does not prevent /feed.xml (or
	// another explicit feed URL) from being accepted.
	if _, feedErr := fetchFeed(u.String()); feedErr == nil {
		header, _ := fetchFeedHeader(u.String())
		return u.String(), header.title, u.String(), header.description, nil
	}
	resp, err := httpClient().Get(u.String())
	if err != nil {
		return "", "", "", "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", "", "", "", err
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		if items, parseErr := parseFeedHeader(body); parseErr == nil {
			return u.String(), items.title, u.String(), items.description, nil
		}
		if _, feedErr := fetchFeed(u.String()); feedErr == nil {
			return u.String(), u.Host, u.String(), "", nil
		}
		if feedURL := discoverHTMLFeed(u, body); feedURL != "" {
			header, _ := fetchFeedHeader(feedURL)
			return feedURL, header.title, u.String(), header.description, nil
		}
	}
	for _, suffix := range []string{"/feed", "/rss.xml", "/atom.xml", "/feed.xml"} {
		candidate := strings.TrimRight(u.String(), "/") + suffix
		if _, err := fetchFeed(candidate); err == nil {
			return candidate, u.Host, u.String(), "", nil
		}
	}
	return "", "", "", "", errors.New("没有找到可解析的 RSS/Atom Feed")
}

type feedHeader struct{ title, description string }

func fetchFeedHeader(feedURL string) (feedHeader, error) {
	response, err := httpClient().Get(feedURL)
	if err != nil {
		return feedHeader{}, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 512<<10))
	if err != nil {
		return feedHeader{}, err
	}
	return parseFeedHeader(body)
}
func parseFeedHeader(body []byte) (feedHeader, error) {
	var rss rssDocument
	if err := xml.Unmarshal(body, &rss); err == nil && rss.Channel.Title != "" {
		return feedHeader{cleanText(rss.Channel.Title), cleanText(rss.Channel.Description)}, nil
	}
	var atom atomDocument
	if err := xml.Unmarshal(body, &atom); err != nil || atom.Title == "" {
		return feedHeader{}, errors.New("not a feed")
	}
	return feedHeader{cleanText(atom.Title), cleanText(atom.Subtitle)}, nil
}
func discoverHTMLFeed(base *url.URL, body []byte) string {
	token := xml.NewDecoder(bytes.NewReader(body))
	for {
		t, err := token.Token()
		if err != nil {
			return ""
		}
		if start, ok := t.(xml.StartElement); ok && strings.EqualFold(start.Name.Local, "link") {
			var rel, typ, href string
			for _, attr := range start.Attr {
				switch strings.ToLower(attr.Name.Local) {
				case "rel":
					rel = attr.Value
				case "type":
					typ = attr.Value
				case "href":
					href = attr.Value
				}
			}
			if strings.Contains(strings.ToLower(rel), "alternate") && (strings.Contains(strings.ToLower(typ), "rss") || strings.Contains(strings.ToLower(typ), "atom") || strings.Contains(strings.ToLower(typ), "xml")) && href != "" {
				resolved, err := base.Parse(href)
				if err == nil {
					return resolved.String()
				}
			}
		}
	}
}
func entryTitleLink(entry atomEntry) string {
	for _, link := range entry.Link {
		if link.Rel == "" || link.Rel == "alternate" {
			return link.Href
		}
	}
	return ""
}
func enclosureImage(enclosure *rssEnclosure) string {
	if enclosure != nil && strings.HasPrefix(enclosure.Type, "image/") {
		return enclosure.URL
	}
	return ""
}
func resolveFeedURL(baseURL, candidate string) string {
	if strings.TrimSpace(candidate) == "" {
		return ""
	}
	parsedBase, err := url.Parse(baseURL)
	if err != nil {
		return candidate
	}
	parsed, err := parsedBase.Parse(strings.TrimSpace(candidate))
	if err != nil {
		return candidate
	}
	return parsed.String()
}
func parseFeedTime(value string) time.Time {
	for _, layout := range []string{time.RFC1123Z, time.RFC1123, time.RFC3339, time.RFC822, time.RFC822Z} {
		if parsed, err := time.Parse(layout, strings.TrimSpace(value)); err == nil {
			return parsed
		}
	}
	return time.Time{}
}
func cleanText(value string) string { return strings.Join(strings.Fields(value), " ") }
func firstFeedValue(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
func stableFeedID(value string) string {
	sum := sha256Sum([]byte(value))
	return fmt.Sprintf("%x", sum[:8])
}
func httpClient() *http.Client {
	return &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("too many redirects")
		}
		return nil
	}}
}

// Small indirections keep this file easy to embed in the desktop binary while
// allowing the config directory to remain the single persistence location.
var osReadFile = func(name string) ([]byte, error) { return os.ReadFile(name) }
var osWriteFile = func(name string, data []byte) error {
	if err := os.MkdirAll(path.Dir(name), 0755); err != nil {
		return err
	}
	return os.WriteFile(name, data, 0644)
}
var errFileNotFound = os.ErrNotExist

func sha256Sum(value []byte) [32]byte { return sha256.Sum256(value) }
