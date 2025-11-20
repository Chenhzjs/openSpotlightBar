#ifndef _SNIPPET_H_
#define _SNIPPET_H_

#include "command.h"
#include <QtCore/QDateTime>
#include <QtCore/QMap>

struct SnippetDefinition {
    QString key;
    QString value;
    QDateTime updatedAt;
};

class SnippetRepository {
public:
    static SnippetRepository &instance();

    QList<SnippetDefinition> all();
    bool addOrUpdate(const QString &key, const QString &value);
    bool remove(const QString &key);
    QString expand(const QString &key) const;

private:
    SnippetRepository();
    void ensureLoaded() const;
    bool loadFromDisk() const;
    bool saveToDisk() const;
    QString storagePath() const;
    QString storageDirectory() const;

    mutable bool loaded;
    mutable QMap<QString, SnippetDefinition> snippets;
};

class SnippetCommand : public CommandBase {
public:
    void execute(const std::vector<std::string> &argument, QListWidget *resultList, QVBoxLayout *layout, QWidget *parent) override;
};

#endif
