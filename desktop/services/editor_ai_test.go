package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"mo-gallery-desktop/config"
	"mo-gallery-desktop/db"

	"gorm.io/datatypes"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestMetadataValidation(t *testing.T) {
	t.Run("accepts absent and inert URLs and paths", func(t *testing.T) {
		if got, err := validateEditorAiMetadata(nil); err != nil || got != nil {
			t.Fatalf("validate nil = %s, %v", got, err)
		}
		input := json.RawMessage(`{"url":"https://example.com/photo.jpg","path":"C:/photos/a.jpg","photoId":"photo-1"}`)
		got, err := validateEditorAiMetadata(input)
		if err != nil {
			t.Fatal(err)
		}
		if !json.Valid(got) {
			t.Fatalf("result is invalid JSON: %s", got)
		}
		precise := json.RawMessage(`{"unknownInteger":9007199254740993}`)
		got, err = validateEditorAiMetadata(precise)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Contains(got, []byte(`9007199254740993`)) {
			t.Fatalf("integer precision changed: %s", got)
		}
	})

	t.Run("rejects invalid trailing visual and oversized values", func(t *testing.T) {
		cases := []json.RawMessage{
			json.RawMessage(`{"value":`),
			json.RawMessage(`{} {}`),
			json.RawMessage(`{"nested":[{"value":"  DaTa:ImAgE/png;base64,AAAA"}]}`),
			json.RawMessage(`{"value":"` + strings.Repeat("x", maxEditorAiMetadataBytes) + `"}`),
		}
		for _, input := range cases {
			if _, err := validateEditorAiMetadata(input); err == nil {
				t.Fatalf("expected validation error for %d-byte metadata", len(input))
			}
		}
	})
}

func TestEditorAiMessageFinishInputDecodesWailsMetadataBytes(t *testing.T) {
	original := []byte(`{"type":"editor_ai_task","task":{"status":"completed","changeSet":{"state":"applied"}}}`)
	transport := make([]int, len(original))
	for index, value := range original {
		transport[index] = int(value)
	}
	payload, err := json.Marshal(map[string]interface{}{
		"messageId": "message-1",
		"status":    "completed",
		"metadata":  transport,
	})
	if err != nil {
		t.Fatal(err)
	}

	var input EditorAiMessageFinishInput
	if err := json.Unmarshal(payload, &input); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(input.Metadata, original) {
		t.Fatalf("metadata transport decoded to %s, want %s", input.Metadata, original)
	}

	validated, err := validateEditorAiMetadata(input.Metadata)
	if err != nil {
		t.Fatal(err)
	}
	var stored interface{}
	if err := json.Unmarshal(validated, &stored); err != nil {
		t.Fatal(err)
	}
	if _, ok := stored.(map[string]interface{}); !ok {
		t.Fatalf("stored metadata type = %T, want object", stored)
	}
}

func TestEditorAiRawMetadataSupportsDirectRawConstruction(t *testing.T) {
	original := []byte(`{"kind":"direct","values":[1,2,3]}`)
	metadata := EditorAiRawMetadata(original)
	validated, err := validateEditorAiMetadata(metadata)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(validated, []byte(`"kind":"direct"`)) {
		t.Fatalf("validated metadata = %s", validated)
	}
}

func TestEditorAiMessageAppendInputIncludesError(t *testing.T) {
	input := EditorAiMessageAppendInput{Error: "generation failed"}
	payload, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(payload, []byte(`"error":"generation failed"`)) {
		t.Fatalf("append payload = %s", payload)
	}
}

func nestedEditorAiMetadata(depth int) EditorAiRawMetadata {
	return EditorAiRawMetadata(strings.Repeat(`{"value":`, depth) + `0` + strings.Repeat(`}`, depth))
}

func newDryRunEditorAiService(t *testing.T) (*EditorAiService, *int) {
	t.Helper()
	database, err := gorm.Open(postgres.Open("host=localhost user=editor_ai_test dbname=editor_ai_test sslmode=disable"), &gorm.Config{
		DisableAutomaticPing:   true,
		DryRun:                 true,
		SkipDefaultTransaction: true,
	})
	if err != nil {
		t.Fatalf("open dry-run database: %v", err)
	}
	createCalls := 0
	if err := database.Callback().Create().Before("gorm:create").Register("test:count-editor-ai-appends", func(*gorm.DB) {
		createCalls++
	}); err != nil {
		t.Fatalf("register dry-run callback: %v", err)
	}
	return &EditorAiService{database: database}, &createCalls
}

func TestEditorAiMessageAppendInputDecodesValidatedMetadataTransport(t *testing.T) {
	original := []byte(`{"url":"https://example.com/photo.jpg","path":"C:/photos/a.jpg","object":{"values":[1,true,null]}}`)
	transport := make([]int, len(original))
	for index, value := range original {
		transport[index] = int(value)
	}
	payload, err := json.Marshal(map[string]interface{}{
		"conversationId": "conversation-1",
		"role":           "user",
		"content":        "hello",
		"metadata":       transport,
	})
	if err != nil {
		t.Fatal(err)
	}

	var input EditorAiMessageAppendInput
	if err := json.Unmarshal(payload, &input); err != nil {
		t.Fatal(err)
	}
	metadata, ok := interface{}(input.Metadata).(EditorAiRawMetadata)
	if !ok || !bytes.Equal(metadata, original) {
		t.Fatalf("append metadata transport decoded to %v, want %s", input.Metadata, original)
	}
}

func TestEditorAiMessageAppendInputRejectsInvalidByteTransport(t *testing.T) {
	for _, metadata := range []string{`[256]`, `[-1]`, `[1.5]`, `[123]`} {
		payload := []byte(`{"conversationId":"conversation-1","role":"user","content":"hello","metadata":` + metadata + `}`)
		var input EditorAiMessageAppendInput
		if err := json.Unmarshal(payload, &input); err == nil {
			t.Fatalf("expected invalid append metadata transport %s to fail", metadata)
		}
	}
}

func TestAppendMessageValidatesMetadataBeforePersistence(t *testing.T) {
	cases := map[string]EditorAiRawMetadata{
		"nested whitespace and case data image": EditorAiRawMetadata(`{"nested":[{"value":"  DaTa:ImAgE/png;base64,AAAA"}]}`),
		"oversized":                             EditorAiRawMetadata(`{"value":"` + strings.Repeat("x", maxEditorAiMetadataBytes) + `"}`),
		"more than 128 levels":                  nestedEditorAiMetadata(129),
	}
	for name, metadata := range cases {
		t.Run(name, func(t *testing.T) {
			service, createCalls := newDryRunEditorAiService(t)
			_, err := service.AppendMessage(EditorAiMessageAppendInput{
				ConversationID: "conversation-1",
				Role:           "user",
				Content:        "hello",
				Metadata:       metadata,
			})
			if err == nil {
				t.Fatal("expected append metadata validation error")
			}
			if *createCalls != 0 {
				t.Fatalf("append reached persistence %d times", *createCalls)
			}
		})
	}
}

func TestAppendMessageAcceptsMaximumMetadataDepth(t *testing.T) {
	service, createCalls := newDryRunEditorAiService(t)
	if _, err := service.AppendMessage(EditorAiMessageAppendInput{
		ConversationID: "conversation-1",
		Role:           "user",
		Content:        "hello",
		Metadata:       nestedEditorAiMetadata(128),
	}); err != nil {
		t.Fatal(err)
	}
	if *createCalls != 1 {
		t.Fatalf("append persistence calls = %d, want 1", *createCalls)
	}
}

func TestAppendMessageRejectsInvalidRoleAndStatusBeforePersistence(t *testing.T) {
	tests := []EditorAiMessageAppendInput{
		{ConversationID: "conversation-1", Role: "tool", Content: "hello"},
		{ConversationID: "conversation-1", Role: "user", Content: "hello", Status: "unknown"},
	}
	for _, input := range tests {
		service, createCalls := newDryRunEditorAiService(t)
		if _, err := service.AppendMessage(input); err == nil {
			t.Fatalf("expected append role/status validation error for %#v", input)
		}
		if *createCalls != 0 {
			t.Fatalf("invalid append reached persistence %d times", *createCalls)
		}
	}
}

func TestMetadataValidationEnforcesMaximumDepth(t *testing.T) {
	if _, err := validateEditorAiMetadata(nestedEditorAiMetadata(128)); err != nil {
		t.Fatalf("128 metadata levels should be accepted: %v", err)
	}
	if _, err := validateEditorAiMetadata(nestedEditorAiMetadata(129)); err == nil {
		t.Fatal("expected metadata deeper than 128 levels to fail")
	}
}

func TestMetadataTaskDecodePreservesLargeIntegers(t *testing.T) {
	metadata, err := decodeEditorAiMetadataObject([]byte(
		`{"type":"editor_ai_task","unknownInteger":9007199254740993,"task":{"status":"completed","changeSet":{"state":"applied"}}}`,
	))
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(metadata)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(encoded, []byte(`"unknownInteger":9007199254740993`)) {
		t.Fatalf("integer precision changed: %s", encoded)
	}
}

func newEditorAiPersistenceTest(t *testing.T) (*EditorAiService, *gorm.DB, string, string) {
	t.Helper()
	dsn := os.Getenv("EDITOR_AI_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("EDITOR_AI_TEST_DATABASE_URL is required for GORM persistence tests")
	}
	database, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open persistence test database: %v", err)
	}
	tx := database.Begin()
	if tx.Error != nil {
		t.Fatalf("begin persistence test transaction: %v", tx.Error)
	}
	t.Cleanup(func() { _ = tx.Rollback().Error })

	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	conversationID := "test-conversation-" + suffix
	messageID := "test-message-" + suffix
	oldModel := "old:model"
	oldError := "old error"
	conversation := db.AiConversation{ID: conversationID, ScopeID: "test-scope-" + suffix, LastModel: &oldModel}
	message := db.AiMessage{
		ID: messageID, ConversationID: conversationID, Role: "assistant", Content: "partial",
		Status: "streaming", Error: &oldError, Metadata: datatypes.JSON(`{"preserved":true}`),
	}
	if err := tx.Create(&conversation).Error; err != nil {
		t.Fatalf("seed conversation: %v", err)
	}
	if err := tx.Create(&message).Error; err != nil {
		t.Fatalf("seed message: %v", err)
	}
	return &EditorAiService{database: tx}, tx, conversationID, messageID
}

func TestAppendMessagePersistsFailedMessageError(t *testing.T) {
	service, database, conversationID, _ := newEditorAiPersistenceTest(t)
	result, err := service.AppendMessage(EditorAiMessageAppendInput{
		ConversationID: conversationID,
		Role:           "assistant",
		Content:        "partial",
		Status:         "failed",
		Error:          "upstream disconnected",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Error == nil || *result.Error != "upstream disconnected" {
		t.Fatalf("result error = %#v", result.Error)
	}

	var stored db.AiMessage
	if err := database.First(&stored, "id = ?", result.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.Error == nil || *stored.Error != "upstream disconnected" {
		t.Fatalf("stored error = %#v", stored.Error)
	}
}

func TestAppendMessageMetadataValidationAndRoundTrip(t *testing.T) {
	service, database, conversationID, _ := newEditorAiPersistenceTest(t)
	var before int64
	if err := database.Model(&db.AiMessage{}).Where(`"conversationId" = ?`, conversationID).Count(&before).Error; err != nil {
		t.Fatal(err)
	}

	_, err := service.AppendMessage(EditorAiMessageAppendInput{
		ConversationID: conversationID,
		Role:           "user",
		Content:        "unsafe",
		Metadata:       EditorAiRawMetadata(`{"nested":{"image":"  DATA:IMAGE/png;base64,AAAA"}}`),
	})
	if err == nil {
		t.Fatal("expected unsafe append metadata to be rejected")
	}
	var afterRejected int64
	if err := database.Model(&db.AiMessage{}).Where(`"conversationId" = ?`, conversationID).Count(&afterRejected).Error; err != nil {
		t.Fatal(err)
	}
	if afterRejected != before {
		t.Fatalf("rejected append inserted a row: before=%d after=%d", before, afterRejected)
	}

	metadata := EditorAiRawMetadata(`{"url":"https://example.com/photo.jpg","path":"C:/photos/a.jpg","object":{"values":[1,true,null]}}`)
	result, err := service.AppendMessage(EditorAiMessageAppendInput{
		ConversationID: conversationID,
		Role:           "assistant",
		Content:        "partial",
		Status:         "failed",
		Metadata:       metadata,
		Error:          "upstream disconnected",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Error == nil || *result.Error != "upstream disconnected" {
		t.Fatalf("result error = %#v", result.Error)
	}
	resultMetadata, err := json.Marshal(result.Metadata)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range [][]byte{[]byte(`"url":"https://example.com/photo.jpg"`), []byte(`"path":"C:/photos/a.jpg"`), []byte(`"values":[1,true,null]`)} {
		if !bytes.Contains(resultMetadata, expected) {
			t.Fatalf("result metadata missing %s: %s", expected, resultMetadata)
		}
	}

	var stored db.AiMessage
	if err := database.First(&stored, "id = ?", result.ID).Error; err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(stored.Metadata, []byte(`"url":"https://example.com/photo.jpg"`)) {
		t.Fatalf("stored metadata = %s", stored.Metadata)
	}
	if stored.Error == nil || *stored.Error != "upstream disconnected" {
		t.Fatalf("stored error = %#v", stored.Error)
	}
}

func TestFinishMessageCommitsStatusMetadataAndConversationTogether(t *testing.T) {
	service, database, conversationID, messageID := newEditorAiPersistenceTest(t)
	var before db.AiConversation
	if err := database.First(&before, "id = ?", conversationID).Error; err != nil {
		t.Fatal(err)
	}
	metadata := EditorAiRawMetadata(`{"type":"editor_ai_task","task":{"taskId":"task-1","status":"completed","changeSet":{"state":"applied"}}}`)
	result, err := service.FinishMessage(EditorAiMessageFinishInput{
		MessageID: messageID, Status: "completed", Content: "done", Model: "openai:gpt-5.6", Metadata: metadata,
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "completed" || result.Content != "done" || result.Model == nil || *result.Model != "openai:gpt-5.6" || result.Error != nil {
		t.Fatalf("result = %#v", result)
	}
	var conversation db.AiConversation
	if err := database.First(&conversation, "id = ?", conversationID).Error; err != nil {
		t.Fatal(err)
	}
	if conversation.LastModel == nil || *conversation.LastModel != "openai:gpt-5.6" || !conversation.UpdatedAt.After(before.UpdatedAt) {
		t.Fatalf("conversation = %#v", conversation)
	}
}

func TestFinishMessageTerminalSemantics(t *testing.T) {
	for _, status := range []string{"failed", "stopped"} {
		t.Run(status, func(t *testing.T) {
			service, database, conversationID, messageID := newEditorAiPersistenceTest(t)
			result, err := service.FinishMessage(EditorAiMessageFinishInput{MessageID: messageID, Status: status, Content: "partial final", Model: "new:model", Error: "required error"})
			if err != nil {
				t.Fatal(err)
			}
			if result.Status != status || result.Error == nil || *result.Error != "required error" || result.Content != "partial final" {
				t.Fatalf("result = %#v", result)
			}
			var conversation db.AiConversation
			if err := database.First(&conversation, "id = ?", conversationID).Error; err != nil {
				t.Fatal(err)
			}
			if conversation.LastModel == nil || *conversation.LastModel != "old:model" {
				t.Fatalf("lastModel = %#v", conversation.LastModel)
			}
		})
	}

	t.Run("completed writes empty content", func(t *testing.T) {
		service, _, _, messageID := newEditorAiPersistenceTest(t)
		result, err := service.FinishMessage(EditorAiMessageFinishInput{MessageID: messageID, Status: "completed"})
		if err != nil {
			t.Fatal(err)
		}
		if result.Content != "" {
			t.Fatalf("content = %q", result.Content)
		}
	})

	t.Run("rejects invalid status and missing terminal error without mutation", func(t *testing.T) {
		for _, input := range []EditorAiMessageFinishInput{{Status: "streaming"}, {Status: "failed"}, {Status: "stopped"}} {
			service, database, _, messageID := newEditorAiPersistenceTest(t)
			input.MessageID = messageID
			if _, err := service.FinishMessage(input); err == nil {
				t.Fatalf("expected error for status %q", input.Status)
			}
			var message db.AiMessage
			if err := database.First(&message, "id = ?", messageID).Error; err != nil {
				t.Fatal(err)
			}
			if message.Status != "streaming" || message.Content != "partial" {
				t.Fatalf("message mutated: %#v", message)
			}
		}
	})
}

func TestFinishMessageRejectsMetadataWithoutMutation(t *testing.T) {
	service, database, _, messageID := newEditorAiPersistenceTest(t)
	_, err := service.FinishMessage(EditorAiMessageFinishInput{MessageID: messageID, Status: "completed", Content: "changed", Metadata: EditorAiRawMetadata(`{"image":" data:image/png;base64,AAAA"}`)})
	if err == nil {
		t.Fatal("expected metadata error")
	}
	var message db.AiMessage
	if err := database.First(&message, "id = ?", messageID).Error; err != nil {
		t.Fatal(err)
	}
	if message.Status != "streaming" || message.Content != "partial" {
		t.Fatalf("message mutated: %#v", message)
	}
}

func TestFinishMessageRollsBackOnLateTransactionFailures(t *testing.T) {
	for _, phase := range []string{"conversation-update", "final-reload"} {
		t.Run(phase, func(t *testing.T) {
			service, database, conversationID, messageID := newEditorAiPersistenceTest(t)
			service.persistenceFailure = func(current string) error {
				if current == phase {
					return errors.New("injected " + phase + " failure")
				}
				return nil
			}
			if _, err := service.FinishMessage(EditorAiMessageFinishInput{
				MessageID: messageID, Status: "completed", Content: "must roll back", Model: "new:model",
			}); err == nil {
				t.Fatal("expected injected transaction failure")
			}
			var message db.AiMessage
			if err := database.First(&message, "id = ?", messageID).Error; err != nil {
				t.Fatal(err)
			}
			if message.Status != "streaming" || message.Content != "partial" || message.Error == nil || *message.Error != "old error" {
				t.Fatalf("message update was not rolled back: %#v", message)
			}
			var conversation db.AiConversation
			if err := database.First(&conversation, "id = ?", conversationID).Error; err != nil {
				t.Fatal(err)
			}
			if conversation.LastModel == nil || *conversation.LastModel != "old:model" {
				t.Fatalf("conversation update was not rolled back: %#v", conversation)
			}
		})
	}
}

func seedTaskMetadata(t *testing.T, database *gorm.DB, messageID string, metadata string) {
	t.Helper()
	if err := database.Model(&db.AiMessage{}).Where("id = ?", messageID).Update("metadata", datatypes.JSON(metadata)).Error; err != nil {
		t.Fatalf("seed task metadata: %v", err)
	}
}

func TestUpdateTaskStatePreservesUnrelatedMetadata(t *testing.T) {
	service, database, _, messageID := newEditorAiPersistenceTest(t)
	seedTaskMetadata(t, database, messageID, `{"type":"editor_ai_task","extension":{"keep":true},"unknownInteger":9007199254740993,"task":{"taskId":"task-1","status":"completed","summary":["kept"],"entries":[{"x":1}],"warnings":["w"],"extra":"yes","changeSet":{"state":"applied","steps":[1]}}}`)
	result, err := service.UpdateTaskState(EditorAiTaskStateUpdateInput{MessageID: messageID, State: "undone"})
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(result.Metadata)
	for _, expected := range [][]byte{[]byte(`"summary":["kept"]`), []byte(`"entries":[{"x":1}]`), []byte(`"warnings":["w"]`), []byte(`"extension":{"keep":true}`), []byte(`"unknownInteger":9007199254740993`), []byte(`"state":"undone"`), []byte(`"steps":[1]`)} {
		if !bytes.Contains(encoded, expected) {
			t.Fatalf("metadata missing %s: %s", expected, encoded)
		}
	}
	var message db.AiMessage
	if err := database.First(&message, "id = ?", messageID).Error; err != nil {
		t.Fatal(err)
	}
	if message.Content != "partial" || message.Status != "streaming" || message.Error == nil || *message.Error != "old error" {
		t.Fatalf("non-metadata fields changed: %#v", message)
	}
}

func TestUpdateTaskStateAcceptsLegacyAndRejectsMalformed(t *testing.T) {
	t.Run("normalizes legacy bare task", func(t *testing.T) {
		service, database, _, messageID := newEditorAiPersistenceTest(t)
		seedTaskMetadata(t, database, messageID, `{"taskId":"legacy","status":"completed","unknown":7,"changeSet":{"state":"applied"}}`)
		result, err := service.UpdateTaskState(EditorAiTaskStateUpdateInput{MessageID: messageID, State: "redone"})
		if err != nil {
			t.Fatal(err)
		}
		encoded, _ := json.Marshal(result.Metadata)
		if !bytes.Contains(encoded, []byte(`"type":"editor_ai_task"`)) || !bytes.Contains(encoded, []byte(`"unknown":7`)) || !bytes.Contains(encoded, []byte(`"state":"redone"`)) {
			t.Fatalf("metadata = %s", encoded)
		}
	})

	cases := map[string]string{
		"reserved malformed": `{"type":"editor_ai_task","status":"completed","changeSet":{"state":"applied"}}`,
		"noncompleted":       `{"type":"editor_ai_task","task":{"status":"failed","changeSet":{"state":"applied"}}}`,
		"missing changeset":  `{"type":"editor_ai_task","task":{"status":"completed"}}`,
	}
	for name, metadata := range cases {
		t.Run(name, func(t *testing.T) {
			service, database, _, messageID := newEditorAiPersistenceTest(t)
			seedTaskMetadata(t, database, messageID, metadata)
			var before db.AiMessage
			if err := database.First(&before, "id = ?", messageID).Error; err != nil {
				t.Fatal(err)
			}
			if _, err := service.UpdateTaskState(EditorAiTaskStateUpdateInput{MessageID: messageID, State: "undone"}); err == nil {
				t.Fatal("expected task metadata error")
			}
			var after db.AiMessage
			if err := database.First(&after, "id = ?", messageID).Error; err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(before.Metadata, after.Metadata) {
				t.Fatalf("metadata mutated: before=%s after=%s", before.Metadata, after.Metadata)
			}
		})
	}

	t.Run("invalid state", func(t *testing.T) {
		service, database, _, messageID := newEditorAiPersistenceTest(t)
		seedTaskMetadata(t, database, messageID, `{"type":"editor_ai_task","task":{"status":"completed","changeSet":{"state":"applied"}}}`)
		if _, err := service.UpdateTaskState(EditorAiTaskStateUpdateInput{MessageID: messageID, State: "pending"}); err == nil {
			t.Fatal("expected invalid state error")
		}
	})
}

func TestGetModelsReturnsProviderGroupedModels(t *testing.T) {
	service := NewEditorAiService(&config.Config{AI: config.AIConfig{
		DefaultModel: "openai:gpt-5.5",
		Providers: map[string]config.AIProviderConfig{
			"openai": {
				BaseURL:                "https://api.openai.example/v1",
				APIKey:                 "openai-key",
				Models:                 []string{"gpt-5.5", "gpt-5.6"},
				ImageModels:            []string{"gpt-5.5"},
				VisionModels:           []string{"gpt-5.5"},
				ToolModels:             []string{"gpt-5.5"},
				StructuredOutputModels: []string{"gpt-5.5"},
				ContextWindows:         map[string]int{"gpt-5.5": 128000},
			},
			"deepseek": {
				BaseURL: "https://api.deepseek.example/v1",
				APIKey:  "deepseek-key",
				Models:  []string{"deepseek-v4-pro"},
			},
		},
	}}, nil)

	result, err := service.GetModels()
	if err != nil {
		t.Fatalf("GetModels() error = %v", err)
	}
	if result.DefaultModel != "openai:gpt-5.5" {
		t.Fatalf("DefaultModel = %q", result.DefaultModel)
	}
	if len(result.Models) != 3 {
		t.Fatalf("models = %#v", result.Models)
	}
	if result.Models[0].ID != "deepseek:deepseek-v4-pro" || result.Models[0].Provider != "deepseek" || result.Models[0].Label != "deepseek / deepseek-v4-pro" {
		t.Fatalf("first model = %#v", result.Models[0])
	}
	if result.Models[1].ID != "openai:gpt-5.5" || result.Models[1].Provider != "openai" || result.Models[1].Model != "gpt-5.5" {
		t.Fatalf("second model = %#v", result.Models[1])
	}
	if len(result.Models[1].Capabilities) != 2 || result.Models[1].Capabilities[0] != "chat" || result.Models[1].Capabilities[1] != "image" {
		t.Fatalf("second model capabilities = %#v", result.Models[1].Capabilities)
	}
	if !result.Models[1].Vision || !result.Models[1].Tools || !result.Models[1].StructuredOutput || result.Models[1].ContextWindow != 128000 {
		t.Fatalf("configured model capabilities = %#v", result.Models[1])
	}
	for _, index := range []int{0, 2} {
		model := result.Models[index]
		if model.Vision || model.Tools || model.StructuredOutput || model.ContextWindow != 8192 {
			t.Fatalf("conservative model capabilities = %#v", model)
		}
	}
}

func TestResolveDesktopModelCapabilitiesUsesExactConfiguredIDs(t *testing.T) {
	provider := config.AIProviderConfig{
		Models:                 []string{"gpt-5.6", "unknown"},
		VisionModels:           []string{"gpt-5.6"},
		ToolModels:             []string{"gpt-5.6"},
		StructuredOutputModels: []string{"gpt-5.6"},
		ContextWindows:         map[string]int{"gpt-5.6": 128000},
	}
	capable := resolveDesktopModelCapabilities(provider, "gpt-5.6")
	if !capable.Vision || !capable.Tools || !capable.StructuredOutput || capable.ContextWindow != 128000 {
		t.Fatalf("capable = %#v", capable)
	}
	for _, modelID := range []string{"unknown", "GPT-5.6", "prefix-gpt-5.6", "gpt-5.6-suffix"} {
		unknown := resolveDesktopModelCapabilities(provider, modelID)
		if unknown.Vision || unknown.Tools || unknown.StructuredOutput || unknown.ContextWindow != 8192 {
			t.Fatalf("capabilities for %q = %#v", modelID, unknown)
		}
	}
}

func TestGetModelsFetchesSpecificProviderModels(t *testing.T) {
	var authHeader string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/models" {
			http.NotFound(w, r)
			return
		}
		authHeader = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]string{{"id": "deepseek-v4-pro"}, {"id": "deepseek-v4-lite"}},
		})
	}))
	defer server.Close()

	service := NewEditorAiService(&config.Config{AI: config.AIConfig{
		DefaultModel: "deepseek:deepseek-v4-pro",
		Providers: map[string]config.AIProviderConfig{
			"deepseek": {
				BaseURL:                server.URL,
				APIKey:                 "deepseek-key",
				VisionModels:           []string{"deepseek-v4-pro"},
				ToolModels:             []string{"deepseek-v4-pro"},
				StructuredOutputModels: []string{"deepseek-v4-pro"},
				ContextWindows:         map[string]int{"deepseek-v4-pro": 64000},
			},
		},
	}}, nil)

	result, err := service.GetProviderModels("deepseek")
	if err != nil {
		t.Fatalf("GetProviderModels() error = %v", err)
	}
	if authHeader != "Bearer deepseek-key" {
		t.Fatalf("Authorization = %q", authHeader)
	}
	if len(result.Models) != 2 || result.Models[0].ID != "deepseek:deepseek-v4-pro" || result.Models[1].ID != "deepseek:deepseek-v4-lite" {
		t.Fatalf("models = %#v", result.Models)
	}
	if !result.Models[0].Vision || !result.Models[0].Tools || !result.Models[0].StructuredOutput || result.Models[0].ContextWindow != 64000 {
		t.Fatalf("configured remote model = %#v", result.Models[0])
	}
	if result.Models[1].Vision || result.Models[1].Tools || result.Models[1].StructuredOutput || result.Models[1].ContextWindow != 8192 {
		t.Fatalf("unknown remote model = %#v", result.Models[1])
	}
	payload, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(payload, []byte("deepseek-key")) {
		t.Fatalf("model response exposed API key: %s", payload)
	}
}
