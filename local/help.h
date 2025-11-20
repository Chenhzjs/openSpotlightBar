#ifndef _HELP_H_
#define _HELP_H_

#include "command.h"
#include <QtCore/QVector>

struct HelpEntry {
    QString command;
    QString description;
    QString example;
};

class HelpCommand : public CommandBase {
public:
    void execute(const std::vector<std::string> &argument, QListWidget *resultList, QVBoxLayout *layout, QWidget *parent) override;

private:
    QVector<HelpEntry> entries() const;
};

#endif
