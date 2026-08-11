package db

import (
	"os"
	"testing"
)

func TestConnectLocalAICreatesSQLiteSchema(t *testing.T) {
	CloseLocalAI()
	configDir := t.TempDir()
	t.Cleanup(CloseLocalAI)
	if err := ConnectLocalAI(configDir); err != nil {
		t.Fatalf("ConnectLocalAI() error = %v", err)
	}

	if _, err := os.Stat(LocalAIPath(configDir)); err != nil {
		t.Fatalf("local AI database not created: %v", err)
	}

	for _, table := range []string{(AiConversation{}).TableName(), (AiMessage{}).TableName()} {
		if !AiDB.Migrator().HasTable(table) {
			t.Fatalf("local AI database missing table %q", table)
		}
	}
	for _, index := range []string{
		"idx_ai_conversation_scope_updated",
		"idx_ai_message_conversation_created",
	} {
		if !AiDB.Migrator().HasIndex(&AiConversation{}, index) && !AiDB.Migrator().HasIndex(&AiMessage{}, index) {
			t.Fatalf("local AI database missing index %q", index)
		}
	}
}

func TestLocalAIConversationPersistsAcrossReconnect(t *testing.T) {
	CloseLocalAI()
	configDir := t.TempDir()
	t.Cleanup(CloseLocalAI)

	if err := ConnectLocalAI(configDir); err != nil {
		t.Fatalf("ConnectLocalAI() error = %v", err)
	}
	conversation := AiConversation{ID: "conversation-1", ScopeID: "zine:project-1"}
	if err := AiDB.Create(&conversation).Error; err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if err := AiDB.Create(&AiMessage{
		ID:             "message-1",
		ConversationID: conversation.ID,
		Role:           "user",
		Content:        "hello",
		Status:         "completed",
	}).Error; err != nil {
		t.Fatalf("create message: %v", err)
	}

	CloseLocalAI()
	if err := ConnectLocalAI(configDir); err != nil {
		t.Fatalf("reconnect local AI database: %v", err)
	}

	var loaded AiConversation
	if err := AiDB.Preload("Messages").First(&loaded, "id = ?", conversation.ID).Error; err != nil {
		t.Fatalf("load conversation after reconnect: %v", err)
	}
	if len(loaded.Messages) != 1 || loaded.Messages[0].Content != "hello" {
		t.Fatalf("messages after reconnect = %#v", loaded.Messages)
	}
}
