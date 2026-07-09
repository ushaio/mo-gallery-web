package services

import (
	"fmt"
	"time"

	"mo-gallery-desktop/db"
)

type OverviewService struct{}

func NewOverviewService() *OverviewService {
	return &OverviewService{}
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

	TotalSize int64 `json:"totalSize"` // bytes

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
	if !db.IsConnected() {
		return nil, fmt.Errorf("数据库未连接，请检查数据库配置后重试")
	}

	d := db.DB
	dto := &OverviewDTO{}

	// PhotoType is derived from the FilmPhoto relation.
	if err := d.Raw(`
		SELECT
			COUNT(*) FILTER (WHERE fp."photoId" IS NULL) AS digital_count,
			COUNT(fp."photoId") AS film_count
		FROM "Photo" p
		LEFT JOIN "FilmPhoto" fp ON fp."photoId" = p."id"
	`).Row().Scan(&dto.DigitalCount, &dto.FilmCount); err != nil {
		return nil, fmt.Errorf("count photo types: %w", err)
	}
	dto.PhotoCount = dto.DigitalCount + dto.FilmCount

	d.Model(&db.Album{}).Count(&dto.AlbumCount)
	d.Model(&db.Story{}).Count(&dto.StoryCount)
	d.Model(&db.Blog{}).Count(&dto.BlogCount)
	d.Model(&db.FilmRoll{}).Count(&dto.FilmRollCount)
	d.Model(&db.FriendLink{}).Count(&dto.FriendCount)
	d.Model(&db.Comment{}).Count(&dto.CommentCount)
	d.Model(&db.Camera{}).Count(&dto.CameraCount)
	d.Model(&db.Lens{}).Count(&dto.LensCount)
	d.Model(&db.Category{}).Count(&dto.CategoryCount)

	d.Model(&db.Photo{}).Where("\"isFeatured\" = ?", true).Count(&dto.FeaturedCount)
	d.Model(&db.Photo{}).Where("\"showFlag\" = ?", false).Count(&dto.HiddenCount)

	d.Model(&db.Comment{}).Where("status = ?", "pending").Count(&dto.PendingComments)
	d.Model(&db.Comment{}).Where("status = ?", "approved").Count(&dto.ApprovedComments)
	d.Model(&db.Comment{}).Where("status = ?", "rejected").Count(&dto.RejectedComments)

	d.Model(&db.Album{}).Where("\"isPublished\" = ?", true).Count(&dto.PublishedAlbums)
	dto.DraftAlbums = dto.AlbumCount - dto.PublishedAlbums
	d.Model(&db.Story{}).Where("\"isPublished\" = ?", true).Count(&dto.PublishedStories)
	dto.DraftStories = dto.StoryCount - dto.PublishedStories
	d.Model(&db.Blog{}).Where("\"isPublished\" = ?", true).Count(&dto.PublishedBlogs)
	dto.DraftBlogs = dto.BlogCount - dto.PublishedBlogs

	d.Model(&db.Photo{}).Select("COALESCE(SUM(size), 0)").Scan(&dto.TotalSize)

	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	yearStart := time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
	d.Model(&db.Photo{}).Where("\"createdAt\" >= ?", monthStart).Count(&dto.PhotosThisMonth)
	d.Model(&db.Photo{}).Where("\"createdAt\" >= ?", yearStart).Count(&dto.PhotosThisYear)

	var recentPhotos []db.Photo
	d.Order("\"createdAt\" desc").Limit(6).Find(&recentPhotos)
	for _, p := range recentPhotos {
		createdAt := ""
		if !p.CreatedAt.IsZero() {
			createdAt = p.CreatedAt.Format(time.RFC3339)
		}
		dto.RecentPhotos = append(dto.RecentPhotos, RecentPhotoDTO{
			ID:           p.ID,
			Title:        p.Title,
			URL:          p.URL,
			ThumbnailURL: p.ThumbnailURL,
			CreatedAt:    createdAt,
		})
	}

	var recentStories []db.Story
	d.Order("\"createdAt\" desc").Limit(5).Find(&recentStories)
	for _, s := range recentStories {
		createdAt := ""
		if !s.CreatedAt.IsZero() {
			createdAt = s.CreatedAt.Format(time.RFC3339)
		}
		dto.RecentStories = append(dto.RecentStories, RecentStoryDTO{
			ID:          s.ID,
			Title:       s.Title,
			CreatedAt:   createdAt,
			IsPublished: s.IsPublished,
		})
	}

	var recentBlogs []db.Blog
	d.Order("\"createdAt\" desc").Limit(5).Find(&recentBlogs)
	for _, b := range recentBlogs {
		createdAt := ""
		if !b.CreatedAt.IsZero() {
			createdAt = b.CreatedAt.Format(time.RFC3339)
		}
		dto.RecentBlogs = append(dto.RecentBlogs, RecentBlogDTO{
			ID:          b.ID,
			Title:       b.Title,
			CreatedAt:   createdAt,
			IsPublished: b.IsPublished,
		})
	}

	return dto, nil
}
