package services

import (
	"errors"
	"time"
)

type FilmRollService struct{ proxy *ProxyClient }

func NewFilmRollService(proxy *ProxyClient) *FilmRollService {
	return &FilmRollService{proxy: proxy}
}

type FilmRollDTO struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Brand      string     `json:"brand"`
	Format     string     `json:"format"`
	ISO        int        `json:"iso"`
	FrameCount int        `json:"frameCount"`
	Notes      *string    `json:"notes,omitempty"`
	ShootDate  *time.Time `json:"shootDate,omitempty"`
	EndDate    *time.Time `json:"endDate,omitempty"`
	PhotoCount int        `json:"photoCount"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
	Photos     []PhotoDTO `json:"photos,omitempty"`
}

type CreateFilmRollParams struct {
	Name       string     `json:"name"`
	Brand      string     `json:"brand"`
	Format     string     `json:"format"`
	ISO        int        `json:"iso"`
	FrameCount int        `json:"frameCount"`
	Notes      string     `json:"notes"`
	ShootDate  *time.Time `json:"shootDate"`
	EndDate    *time.Time `json:"endDate"`
}

type UpdateFilmRollParams struct {
	Name       *string    `json:"name,omitempty"`
	Brand      *string    `json:"brand,omitempty"`
	Format     *string    `json:"format,omitempty"`
	ISO        *int       `json:"iso,omitempty"`
	FrameCount *int       `json:"frameCount,omitempty"`
	Notes      *string    `json:"notes,omitempty"`
	ShootDate  *time.Time `json:"shootDate,omitempty"`
	EndDate    *time.Time `json:"endDate,omitempty"`
}

func (s *FilmRollService) checkReady() error {
	if s.proxy == nil || !s.proxy.IsReady() {
		return errors.New("未连接到服务器")
	}
	return nil
}

func (s *FilmRollService) List() ([]FilmRollDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var rolls []FilmRollDTO
	if err := s.proxy.GET("/admin/film-rolls", &rolls); err != nil {
		return nil, err
	}
	return rolls, nil
}

func (s *FilmRollService) GetByID(id string) (*FilmRollDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var roll FilmRollDTO
	if err := s.proxy.GET("/admin/film-rolls/"+id, &roll); err != nil {
		return nil, err
	}
	return &roll, nil
}

func (s *FilmRollService) Create(params CreateFilmRollParams) (*FilmRollDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	if params.Name == "" {
		return nil, errors.New("胶卷名称不能为空")
	}
	var roll FilmRollDTO
	if err := s.proxy.POST("/admin/film-rolls", params, &roll); err != nil {
		return nil, err
	}
	return &roll, nil
}

func (s *FilmRollService) Update(id string, params UpdateFilmRollParams) (*FilmRollDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var roll FilmRollDTO
	if err := s.proxy.PATCH("/admin/film-rolls/"+id, params, &roll); err != nil {
		return nil, err
	}
	return &roll, nil
}

func (s *FilmRollService) Delete(id string) error {
	if err := s.checkReady(); err != nil {
		return err
	}
	return s.proxy.DELETE("/admin/film-rolls/" + id)
}
