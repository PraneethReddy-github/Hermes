CREATE VIRTUAL TABLE `search_index` USING fts5(
	entity_type UNINDEXED,
	entity_id UNINDEXED,
	title,
	body,
	tokenize = 'unicode61 remove_diacritics 2'
);
