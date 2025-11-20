#ifndef _WORKFLOW_H_
#define _WORKFLOW_H_

#include "command.h"
#include <QtCore/QList>
#include <QtCore/QStringList>

struct WorkflowDefinition {
    QString keyword;
    QString command;
    QString description;
};

class WorkflowManager {
public:
    static WorkflowManager &instance();

    QList<WorkflowDefinition> workflows() const;
    bool reload();
    bool run(const QString &keyword, const QStringList &arguments, QStringList &output, QStringList &errors) const;
    QString configLocation() const;

private:
    WorkflowManager();
    void ensureLoaded() const;
    bool loadFromDisk() const;
    bool createDefaultConfig() const;
    QString configDirectory() const;
    QString configPath() const;
    WorkflowDefinition find(const QString &keyword) const;

    mutable bool loaded;
    mutable QList<WorkflowDefinition> definitions;
};

class WorkflowCommand : public CommandBase {
public:
    void execute(const std::vector<std::string> &argument, QListWidget *resultList, QVBoxLayout *layout, QWidget *parent) override;
};

#endif
