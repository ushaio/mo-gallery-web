package services

import "errors"

type OverviewService struct {
	proxy *ProxyClient
}

func NewOverviewService(proxy *ProxyClient) *OverviewService {
	return &OverviewService{proxy: proxy}
}

type OverviewDTO struct {
	PhotoCount    int64 `json:"photoCount"`
	DigitalCount  int64 `json:"digitalCount"`
	FilmCount     int64 `json:"filmCount"`
	AlbumCount    int64 `json:"albumCount"`
	StoryCount    int64 `json:"storyCount"`
	BlogCount     int64 `json:"blogCount"`
	FilmRollCount int64 `json:"filmRollCount"`
	FriendCount   int64 `json:"friendCount"`
	CommentCount  int64 `json:"commentCount"`
	CameraCount   int64 `json:"cameraCount"`
	LensCount     int64 `json:"lensCount"`
	CategoryCount int64 `json:"categoryCount"`

	FeaturedCount int64 `json:"featuredCount"`
	HiddenCount   int64 `json:"hiddenCount"`

	PendingComments  int64 `json:"pendingComments"`
	ApprovedComments int64 `json:"approvedComments"`
	RejectedComments int64 `json:"rejectedComments"`

	TotalSize int64 `json:"totalSize"`

	PublishedAlbums  int64 `json:"publishedAlbums"`
	DraftAlbums      int64 `json:"draftAlbums"`
	PublishedStories int64 `json:"publishedStories"`
	DraftStories     int64 `json:"draftStories"`
	PublishedBlogs   int64 `json:"publishedBlogs"`
	DraftBlogs       int64 `json:"draftBlogs"`

	RecentPhotos  []RecentPhotoDTO `json:"recentPhotos"`
	RecentStories []RecentStoryDTO `json:"recentStories"`
	RecentBlogs   []RecentBlogDTO  `json:"recentBlogs"`

	PhotosThisMonth int64 `json:"photosThisMonth"`
	PhotosThisYear  int64 `json:"photosThisYear"`
}

type RecentPhotoDTO struct {
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	URL          string  `json:"url"`
	ThumbnailURL *string `json:"thumbnailUrl,omitempty"`
	CreatedAt    string  `json:"createdAt"`
}

type RecentStoryDTO struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	CreatedAt   string `json:"createdAt"`
	IsPublished bool   `json:"isPublished"`
}

type RecentBlogDTO struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	CreatedAt   string `json:"createdAt"`
	IsPublished bool   `json:"isPublished"`
}

func (s *OverviewService) GetOverview() (*OverviewDTO, error) {
	if s.proxy == nil || !s.proxy.IsReady() {
		return nil, errors.New("未连接到服务器")
	}

	var result OverviewDTO
	if err := s.proxy.GET("/admin/overview", &result); err != nil {
		return nil, err
	}
	return &result, nil
}
