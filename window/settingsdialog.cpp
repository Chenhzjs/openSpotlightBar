#include "settingsdialog.h"
#include <QtWidgets/QVBoxLayout>
#include <QtWidgets/QLabel>
#include <QtWidgets/QPushButton>
#include <QtWidgets/QDialogButtonBox>
#include <QtWidgets/QGroupBox>
#include <QtWidgets/QTabWidget>
#include <QtWidgets/QTableWidget>
#include <QtWidgets/QHeaderView>
#include <QtWidgets/QHBoxLayout>
#include <QtCore/QStandardPaths>
#include <QtCore/QDir>
#include <QtCore/QUrl>
#include <QtCore/QFileInfo>
#include <QtGui/QDesktopServices>
#include <QtGui/QIcon>

namespace {
QString storageBasePath() {
    QString base = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    if (base.isEmpty()) {
        base = QDir::homePath() + QStringLiteral("/.openSpotlightBar");
    }
    return base;
}
}

SettingsDialog::SettingsDialog(QWidget *parent)
    : QDialog(parent) {
    setWindowTitle(tr("Spotlight Settings"));
    setModal(false);
    setAttribute(Qt::WA_DeleteOnClose, false);
    setMinimumWidth(420);
    setObjectName(QStringLiteral("settingsDialog"));

    const QString base = storageBasePath();
    snippetsPath = base + QStringLiteral("/snippets.json");
    workflowsPath = base + QStringLiteral("/workflows.json");

    auto *tabs = new QTabWidget(this);

    // Workflows tab
    QWidget *workflowPage = new QWidget(this);
    QVBoxLayout *workflowLayout = new QVBoxLayout(workflowPage);
    workflowLayout->setContentsMargins(12, 12, 12, 12);
    workflowLayout->setSpacing(8);

    QLabel *workflowInfo = new QLabel(tr("Create Alfred-style workflows visually. "
                                         "Each row is a keyword, an optional description, and the shell command to run "
                                         "(use {query} or {0},{1} placeholders)."));
    workflowInfo->setWordWrap(true);
    workflowLayout->addWidget(workflowInfo);

    workflowTable = new QTableWidget(workflowPage);
    workflowTable->setColumnCount(3);
    workflowTable->setHorizontalHeaderLabels({tr("Keyword"), tr("Description"), tr("Command")});
    workflowTable->horizontalHeader()->setStretchLastSection(true);
    workflowTable->horizontalHeader()->setSectionResizeMode(0, QHeaderView::ResizeToContents);
    workflowTable->horizontalHeader()->setSectionResizeMode(1, QHeaderView::Stretch);
    workflowTable->verticalHeader()->setVisible(false);
    workflowTable->setSelectionBehavior(QAbstractItemView::SelectRows);
    workflowTable->setSelectionMode(QAbstractItemView::SingleSelection);
    workflowTable->setShowGrid(false);
    workflowLayout->addWidget(workflowTable);

    QHBoxLayout *workflowButtons = new QHBoxLayout();
    QPushButton *addButton = new QPushButton(tr("Add Row"), workflowPage);
    removeButton = new QPushButton(tr("Remove"), workflowPage);
    QPushButton *reloadButton = new QPushButton(tr("Reload"), workflowPage);
    saveButton = new QPushButton(tr("Save Workflows"), workflowPage);

    connect(addButton, &QPushButton::clicked, this, &SettingsDialog::addWorkflowRow);
    connect(removeButton, &QPushButton::clicked, this, &SettingsDialog::removeSelectedWorkflows);
    connect(reloadButton, &QPushButton::clicked, this, &SettingsDialog::reloadWorkflows);
    connect(saveButton, &QPushButton::clicked, this, &SettingsDialog::saveWorkflows);

    workflowButtons->addWidget(addButton);
    workflowButtons->addWidget(removeButton);
    workflowButtons->addWidget(reloadButton);
    workflowButtons->addStretch();
    workflowButtons->addWidget(saveButton);
    workflowLayout->addLayout(workflowButtons);

    tabs->addTab(workflowPage, tr("Workflows"));

    // Storage tab
    QWidget *storagePage = new QWidget(this);
    QVBoxLayout *storageLayout = new QVBoxLayout(storagePage);
    storageLayout->setContentsMargins(12, 12, 12, 12);
    storageLayout->setSpacing(12);
    auto makeSection = [&](const QString &title, const QString &path, auto slot) {
        auto *section = new QGroupBox(title, storagePage);
        auto *layout = new QVBoxLayout(section);
        auto *pathLabel = new QLabel(tr("Stored at: <code>%1</code>").arg(path.toHtmlEscaped()), section);
        pathLabel->setTextFormat(Qt::RichText);
        pathLabel->setTextInteractionFlags(Qt::TextBrowserInteraction | Qt::TextSelectableByMouse);
        layout->addWidget(pathLabel);
        auto *openButton = new QPushButton(tr("Open Folder"), section);
        connect(openButton, &QPushButton::clicked, this, slot);
        layout->addWidget(openButton);
        section->setLayout(layout);
        storageLayout->addWidget(section);
    };
    makeSection(tr("Snippets"), snippetsPath, [this]() { openSnippetsFolder(); });
    makeSection(tr("Workflows (JSON)"), workflowsPath, [this]() { openWorkflowsFolder(); });
    storageLayout->addStretch();
    tabs->addTab(storagePage, tr("Storage"));

    auto *mainLayout = new QVBoxLayout(this);
    mainLayout->setContentsMargins(16, 16, 16, 16);
    mainLayout->setSpacing(12);
    mainLayout->addWidget(tabs);

    auto *buttons = new QDialogButtonBox(QDialogButtonBox::Close, this);
    connect(buttons, &QDialogButtonBox::rejected, this, &SettingsDialog::close);
    mainLayout->addWidget(buttons);

    populateWorkflowTable(WorkflowManager::instance().workflows());

    setStyleSheet(R"(
        QDialog#settingsDialog {
            background-color: #0f1116;
            color: #E8EBF2;
        }
        QLabel {
            color: #E8EBF2;
        }
        QGroupBox {
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 8px;
            margin-top: 10px;
        }
        QGroupBox::title {
            subcontrol-origin: margin;
            left: 12px;
            padding: 2px 6px;
            color: #9CB8FF;
        }
        QPushButton {
            background-color: #1f2530;
            color: #E8EBF2;
            border: 1px solid #394458;
            border-radius: 6px;
            padding: 6px 12px;
        }
        QPushButton:hover {
            border-color: #5B8BFF;
        }
        QTabWidget::pane {
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 8px;
        }
        QTabBar::tab {
            background: #161922;
            color: #E8EBF2;
            padding: 8px 12px;
            border: 1px solid rgba(255,255,255,0.08);
            border-bottom: none;
            border-top-left-radius: 6px;
            border-top-right-radius: 6px;
            margin-right: 2px;
        }
        QTabBar::tab:selected {
            background: #222838;
            border-color: #5B8BFF;
        }
        QTableWidget {
            background: #161922;
            alternate-background-color: #1b202b;
            gridline-color: rgba(255,255,255,0.05);
            color: #E8EBF2;
            selection-background-color: rgba(91,139,255,0.25);
            selection-color: #E8EBF2;
        }
        QHeaderView::section {
            background: #1b202b;
            color: #AEB8CC;
            border: none;
            padding: 6px 8px;
        }
    )");
}

void SettingsDialog::openSnippetsFolder() {
    QDesktopServices::openUrl(QUrl::fromLocalFile(QFileInfo(snippetsPath).absolutePath()));
}

void SettingsDialog::openWorkflowsFolder() {
    QDesktopServices::openUrl(QUrl::fromLocalFile(QFileInfo(workflowsPath).absolutePath()));
}

void SettingsDialog::addWorkflowRow() {
    int row = workflowTable->rowCount();
    workflowTable->insertRow(row);
    workflowTable->setItem(row, 0, new QTableWidgetItem());
    workflowTable->setItem(row, 1, new QTableWidgetItem());
    workflowTable->setItem(row, 2, new QTableWidgetItem());
    workflowTable->scrollToBottom();
}

void SettingsDialog::removeSelectedWorkflows() {
    auto selected = workflowTable->selectionModel()->selectedRows();
    for (const QModelIndex &index : selected) {
        workflowTable->removeRow(index.row());
    }
}

void SettingsDialog::reloadWorkflows() {
    if (WorkflowManager::instance().reload()) {
        populateWorkflowTable(WorkflowManager::instance().workflows());
    }
}

void SettingsDialog::saveWorkflows() {
    const QList<WorkflowDefinition> defs = collectWorkflowTable();
    if (WorkflowManager::instance().saveAll(defs)) {
        WorkflowManager::instance().reload();
    }
}

void SettingsDialog::populateWorkflowTable(const QList<WorkflowDefinition> &definitions) {
    workflowTable->clearContents();
    workflowTable->setRowCount(definitions.size());
    int row = 0;
    for (const WorkflowDefinition &def : definitions) {
        workflowTable->setItem(row, 0, new QTableWidgetItem(def.keyword));
        workflowTable->setItem(row, 1, new QTableWidgetItem(def.description));
        workflowTable->setItem(row, 2, new QTableWidgetItem(def.command));
        row++;
    }
}

QList<WorkflowDefinition> SettingsDialog::collectWorkflowTable() const {
    QList<WorkflowDefinition> defs;
    const int rows = workflowTable->rowCount();
    for (int r = 0; r < rows; ++r) {
        WorkflowDefinition def;
        QTableWidgetItem *kw = workflowTable->item(r, 0);
        QTableWidgetItem *desc = workflowTable->item(r, 1);
        QTableWidgetItem *cmd = workflowTable->item(r, 2);
        def.keyword = kw ? kw->text().trimmed() : QString();
        def.description = desc ? desc->text().trimmed() : QString();
        def.command = cmd ? cmd->text().trimmed() : QString();
        if (def.keyword.isEmpty() || def.command.isEmpty()) {
            continue;
        }
        defs.append(def);
    }
    return defs;
}

void SettingsDialog::refreshWorkflowsView() {
    populateWorkflowTable(WorkflowManager::instance().workflows());
}
