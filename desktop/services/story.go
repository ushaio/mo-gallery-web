package services

import (
	"encoding/json"
	"errors"
	"log"
	"time"
)

type StoryService struct {
	proxy *ProxyClient
}

func NewStoryService(proxy *ProxyClient) *StoryService {
	return &StoryService{proxy: proxy}
}

type StoryDTO struct {
	ID           string          `json:"id"`
	Title        string          `json:"title"`
	Content      string          `json:"content"`
	ContentJSON  json.RawMessage `json:"contentJson,omitempty"`
	CoverPhotoID *string         `json:"coverPhotoId,omitempty"`
	CoverCrop    json.RawMessage `json:"coverCrop,omitempty"`
	IsPublished  bool        `json:"isPublished"`
	StoryDate    *time.Time  `json:"storyDate,omitempty"`
	CreatedAt    time.Time   `json:"createdAt"`
	UpdatedAt    time.Time   `json:"updatedAt"`
	Photos       []PhotoDTO  `json:"photos,omitempty"`
}

type CreateStoryParams struct {
	Title        string          `json:"title"`
	Content      string          `json:"content"`
	ContentJSON  json.RawMessage `json:"contentJson,omitempty"`
	IsPublished  bool            `json:"isPublished"`
	PhotoIDs     []string        `json:"photoIds,omitempty"`
	CoverPhotoID *string         `json:"coverPhotoId,omitempty"`
	CoverCrop    json.RawMessage `json:"coverCrop,omitempty"`
	StoryDate    *time.Time      `json:"storyDate,omitempty"`
}

type UpdateStoryParams struct {
	Title        *string         `json:"title,omitempty"`
	Content      *string         `json:"content,omitempty"`
	ContentJSON  json.RawMessage `json:"contentJson,omitempty"`
	IsPublished  *bool           `json:"isPublished,omitempty"`
	CoverPhotoID *string         `json:"coverPhotoId,omitempty"`
	CoverCrop    json.RawMessage `json:"coverCrop,omitempty"`
	StoryDate    *time.Time      `json:"storyDate,omitempty"`
}

func (s *StoryService) checkReady() error {
	if s.proxy == nil || !s.proxy.IsReady() {
		return errors.New("未连接到服务器")
	}
	return nil
}

func (s *StoryService) List() ([]StoryDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var stories []StoryDTO
	if err := s.proxy.GET("/admin/stories", &stories); err != nil {
		log.Printf("[stories] List error: %v", err)
		return nil, err
	}
	log.Printf("[stories] List got %d stories", len(stories))
	return stories, nil
}

func (s *StoryService) GetByID(id string) (*StoryDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var story StoryDTO
	if err := s.proxy.GET("/admin/stories/"+id, &story); err != nil {
		return nil, err
	}
	return &story, nil
}

func (s *StoryService) Create(params CreateStoryParams) (*StoryDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	if params.Title == "" {
		return nil, errors.New("标题不能为空")
	}
	var story StoryDTO
	if err := s.proxy.POST("/admin/stories", params, &story); err != nil {
		return nil, err
	}
	return &story, nil
}

func (s *StoryService) Update(id string, params UpdateStoryParams) (*StoryDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var story StoryDTO
	if err := s.proxy.PATCH("/admin/stories/"+id, params, &story); err != nil {
		return nil, err
	}
	return &story, nil
}

func (s *StoryService) Delete(id string) error {
	if err := s.checkReady(); err != nil {
		return err
	}
	return s.proxy.DELETE("/admin/stories/" + id)
}

func (s *StoryService) AddStoryPhoto(storyID, photoID string) error {
	if err := s.checkReady(); err != nil {
		return err
	}
	return s.proxy.POST("/admin/stories/"+storyID+"/photos", map[string]any{"photoIds": []string{photoID}}, nil)
}

func (s *StoryService) RemoveStoryPhoto(storyID, photoID string) error {
	if err := s.checkReady(); err != nil {
		return err
	}
	return s.proxy.DELETE("/admin/stories/" + storyID + "/photos/" + photoID)
}

func (s *StoryService) ReorderPhotos(storyID string, photoIDs []string) (*StoryDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var story StoryDTO
	if err := s.proxy.PATCH("/admin/stories/"+storyID+"/photos/reorder", map[string]any{"photoIds": photoIDs}, &story); err != nil {
		return nil, err
	}
	return &story, nil
}
