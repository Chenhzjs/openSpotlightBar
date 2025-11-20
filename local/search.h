#ifndef _SEARCH_H_
#define _SEARCH_H_

#include "command.h"
#include <QtCore/QList>
#include <QtCore/QStringList>

struct SearchResult {
    QString name;
    QString path;
    bool isDirectory;
    bool isApplication;
    int score;
};

class SearchEngine {
public:
    SearchEngine();
    QList<SearchResult> search(const QString &query, int maxResults = 40);

private:
    QStringList roots;
    void addRootIfValid(const QString &path);
    QList<SearchResult> runNativeSearch(const QString &query, int maxResults);
    QList<SearchResult> runIteratorSearch(const QString &query, int maxResults);
    int score(const QString &name, const QString &query) const;
};

class Search : public CommandBase {
public:
    Search();
    void execute(const std::vector<std::string> &argument, QListWidget *resultList, QVBoxLayout *layout, QWidget *parent) override;

private:
    SearchEngine engine;
    QList<SearchResult> runSearch(const QString &query);
    void displayResults(QListWidget *resultList, const QList<SearchResult> &results);
};

#endif
