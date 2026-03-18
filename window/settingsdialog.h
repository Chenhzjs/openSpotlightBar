#ifndef SETTINGSDIALOG_H
#define SETTINGSDIALOG_H

#include <QtWidgets/QDialog>
#include <QtWidgets/QTableWidget>
#include <QtWidgets/QPushButton>
#include "../local/workflow.h"

class SettingsDialog : public QDialog {
    Q_OBJECT
public:
    explicit SettingsDialog(QWidget *parent = nullptr);
    void refreshWorkflowsView();

private slots:
    void openSnippetsFolder();
    void openWorkflowsFolder();
    void addWorkflowRow();
    void removeSelectedWorkflows();
    void reloadWorkflows();
    void saveWorkflows();

private:
    QString snippetsPath;
    QString workflowsPath;
    QTableWidget *workflowTable;
    QPushButton *saveButton;
    QPushButton *removeButton;
    void populateWorkflowTable(const QList<WorkflowDefinition> &definitions);
    QList<WorkflowDefinition> collectWorkflowTable() const;
};

#endif
