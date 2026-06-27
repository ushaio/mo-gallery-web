package services

import (
	"encoding/json"
	"errors"
	"time"
)

type BlogService struct{ proxy *ProxyClient }

func NewBlogService(proxy *ProxyClient) *BlogService {
	return &BlogService{proxy: proxy}
}

type BlogDTO struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Content     string          `json:"content"`
	ContentJSON json.RawMessage `json:"contentJson,omitempty"`
	Category    string    `json:"category"`
	Tags        string    `json:"tags"`
	IsPublished bool      `json:"isPublished"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type CreateBlogParams struct {
	Title       string          `json:"title"`
	Content     string          `json:"content"`
	ContentJSON json.RawMessage `json:"contentJson,omitempty"`
	Category    string          `json:"category"`
	Tags        string          `json:"tags"`
	IsPublished bool            `json:"isPublished"`
}

type UpdateBlogParams struct {
	Title       *string         `json:"title,omitempty"`
	Content     *string         `json:"content,omitempty"`
	ContentJSON json.RawMessage `json:"contentJson,omitempty"`
	Category    *string         `json:"category,omitempty"`
	Tags        *string         `json:"tags,omitempty"`
	IsPublished *bool           `json:"isPublished,omitempty"`
}

func (s *BlogService) checkReady() error {
	if s.proxy == nil || !s.proxy.IsReady() {
		return errors.New("未连接到服务器")
	}
	return nil
}

func (s *BlogService) List() ([]BlogDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var blogs []BlogDTO
	if err := s.proxy.GET("/admin/blogs", &blogs); err != nil {
		return nil, err
	}
	return blogs, nil
}

func (s *BlogService) GetByID(id string) (*BlogDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var blog BlogDTO
	if err := s.proxy.GET("/admin/blogs/"+id, &blog); err != nil {
		return nil, err
	}
	return &blog, nil
}

func (s *BlogService) Create(params CreateBlogParams) (*BlogDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	if params.Title == "" {
		return nil, errors.New("标题不能为空")
	}
	var blog BlogDTO
	if err := s.proxy.POST("/admin/blogs", params, &blog); err != nil {
		return nil, err
	}
	return &blog, nil
}

func (s *BlogService) Update(id string, params UpdateBlogParams) (*BlogDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var blog BlogDTO
	if err := s.proxy.PATCH("/admin/blogs/"+id, params, &blog); err != nil {
		return nil, err
	}
	return &blog, nil
}

func (s *BlogService) Delete(id string) error {
	if err := s.checkReady(); err != nil {
		return err
	}
	return s.proxy.DELETE("/admin/blogs/" + id)
}
