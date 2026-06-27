package services

import (
	"fmt"
	"net/url"
)

// PaginatedResponse 分页响应
type PaginatedResponse[T any] struct {
	Data []T           `json:"data"`
	Meta PaginationMeta `json:"meta"`
}

type PaginationMeta struct {
	Total      int  `json:"total"`
	Page       int  `json:"page"`
	PageSize   int  `json:"pageSize"`
	TotalPages int  `json:"totalPages"`
	HasMore    bool `json:"hasMore"`
}

// buildQuery 构造 URL 查询参数（跳过空值）
func buildQuery(params map[string]string) string {
	q := url.Values{}
	for k, v := range params {
		if v != "" {
			q.Set(k, v)
		}
	}
	return q.Encode()
}

func itoa(i int) string {
	return fmt.Sprintf("%d", i)
}
