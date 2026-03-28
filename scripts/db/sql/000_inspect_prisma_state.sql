SELECT migration_name, checksum, finished_at, rolled_back_at
FROM "_prisma_migrations"
ORDER BY finished_at;

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'AiConversation'
ORDER BY indexname;

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'Story' AND column_name = 'storyDate';
