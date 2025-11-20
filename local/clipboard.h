#ifndef _CLIPBOARD_H_
#define _CLIPBOARD_H_

#include "command.h"
#include <QtCore/QDateTime>
#include <QtCore/QObject>
#include <QtCore/QVector>
#include <QtGui/QClipboard>

struct ClipboardEntry {
    QString preview;
    QString payload;
    QString category;
    QDateTime timestamp;
    bool isText;
};

class ClipboardManager : public QObject {
    Q_OBJECT
public:
    static ClipboardManager &instance();

    const QVector<ClipboardEntry> &history() const;
    bool copyEntry(int index);
    void clear();

private slots:
    void handleDataChanged();

private:
    ClipboardManager();
    void appendEntry(const ClipboardEntry &entry);

    QClipboard *clipboard;
    QVector<ClipboardEntry> entries;
    int maxItems;
};

class ClipboardCommand : public CommandBase {
public:
    void execute(const std::vector<std::string> &argument, QListWidget *resultList, QVBoxLayout *layout, QWidget *parent) override;
};

#endif
