#include "workflow.h"
#include <QtCore/QDir>
#include <QtCore/QFile>
#include <QtCore/QJsonArray>
#include <QtCore/QJsonDocument>
#include <QtCore/QJsonObject>
#include <QtCore/QProcess>
#include <QtCore/QStandardPaths>
#include <QtWidgets/QListWidget>

WorkflowManager &WorkflowManager::instance() {
    static WorkflowManager manager;
    return manager;
}

WorkflowManager::WorkflowManager() : loaded(false) {
}

void WorkflowManager::ensureLoaded() const {
    if (!loaded) {
        loadFromDisk();
    }
}

QList<WorkflowDefinition> WorkflowManager::workflows() const {
    ensureLoaded();
    return definitions;
}

bool WorkflowManager::reload() {
    loaded = false;
    definitions.clear();
    return loadFromDisk();
}

QString WorkflowManager::configLocation() const {
    return configPath();
}

bool WorkflowManager::saveAll(const QList<WorkflowDefinition> &items) {
    QDir dir(configDirectory());
    if (!dir.exists()) {
        dir.mkpath(QStringLiteral("."));
    }
    QFile file(configPath());
    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        return false;
    }
    QJsonArray array;
    for (const WorkflowDefinition &def : items) {
        if (def.keyword.trimmed().isEmpty() || def.command.trimmed().isEmpty()) {
            continue;
        }
        QJsonObject obj;
        obj.insert(QStringLiteral("keyword"), def.keyword.trimmed());
        obj.insert(QStringLiteral("description"), def.description);
        obj.insert(QStringLiteral("command"), def.command);
        array.append(obj);
    }
    QJsonDocument doc(array);
    file.write(doc.toJson(QJsonDocument::Indented));
    file.close();
    definitions = items;
    loaded = true;
    return true;
}

WorkflowDefinition WorkflowManager::find(const QString &keyword) const {
    ensureLoaded();
    for (const WorkflowDefinition &definition : definitions) {
        if (definition.keyword.compare(keyword, Qt::CaseInsensitive) == 0) {
            return definition;
        }
    }
    return WorkflowDefinition{};
}

bool WorkflowManager::run(const QString &keyword, const QStringList &arguments, QStringList &output, QStringList &errors) const {
    WorkflowDefinition definition = find(keyword);
    if (definition.keyword.isEmpty()) {
        errors << QStringLiteral("No workflow registered for \"%1\".").arg(keyword);
        return false;
    }

    QString commandLine = definition.command;
    if (commandLine.contains(QStringLiteral("{query}"))) {
        commandLine.replace(QStringLiteral("{query}"), arguments.join(QLatin1Char(' ')));
    }
    for (int i = 0; i < arguments.size(); ++i) {
        commandLine.replace(QStringLiteral("{%1}").arg(i), arguments.at(i));
    }

    QProcess process;
    process.start(QStringLiteral("/bin/bash"), QStringList{QStringLiteral("-lc"), commandLine});
    if (!process.waitForFinished(8000)) {
        process.kill();
        errors << QStringLiteral("Workflow \"%1\" timed out.").arg(keyword);
        return false;
    }

    const QString stdoutData = QString::fromUtf8(process.readAllStandardOutput());
    const QString stderrData = QString::fromUtf8(process.readAllStandardError());

    for (const QString &line : stdoutData.split(QLatin1Char('\n'), Qt::SkipEmptyParts)) {
        output << line.trimmed();
    }
    for (const QString &line : stderrData.split(QLatin1Char('\n'), Qt::SkipEmptyParts)) {
        errors << line.trimmed();
    }

    if (process.exitStatus() != QProcess::NormalExit || process.exitCode() != 0) {
        errors << QStringLiteral("Workflow \"%1\" exited with code %2.").arg(keyword).arg(process.exitCode());
        return false;
    }
    return true;
}

bool WorkflowManager::createDefaultConfig() const {
    QDir dir(configDirectory());
    if (!dir.exists()) {
        dir.mkpath(QStringLiteral("."));
    }
    QFile file(configPath());
    if (file.exists()) {
        return true;
    }
    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        return false;
    }
    QJsonArray defaults;
    defaults.append(QJsonObject{
        {QStringLiteral("keyword"), QStringLiteral("web")},
        {QStringLiteral("description"), QStringLiteral("Search the web in your default browser.")},
        {QStringLiteral("command"), QStringLiteral("open \"https://www.google.com/search?q={query}\"")}
    });
    defaults.append(QJsonObject{
        {QStringLiteral("keyword"), QStringLiteral("time")},
        {QStringLiteral("description"), QStringLiteral("Print the current date and time.")},
        {QStringLiteral("command"), QStringLiteral("date")}
    });
    QJsonDocument document(defaults);
    file.write(document.toJson(QJsonDocument::Indented));
    file.close();
    return true;
}

bool WorkflowManager::loadFromDisk() const {
    if (!createDefaultConfig()) {
        definitions.clear();
        loaded = true;
        return false;
    }
    QFile file(configPath());
    if (!file.open(QIODevice::ReadOnly)) {
        definitions.clear();
        loaded = true;
        return false;
    }
    const QByteArray data = file.readAll();
    file.close();
    QJsonParseError parseError;
    const QJsonDocument document = QJsonDocument::fromJson(data, &parseError);
    definitions.clear();
    if (parseError.error != QJsonParseError::NoError || !document.isArray()) {
        loaded = true;
        return false;
    }
    const QJsonArray array = document.array();
    for (const QJsonValue &value : array) {
        if (!value.isObject()) {
            continue;
        }
        const QJsonObject object = value.toObject();
        WorkflowDefinition definition;
        definition.keyword = object.value(QStringLiteral("keyword")).toString();
        definition.command = object.value(QStringLiteral("command")).toString();
        definition.description = object.value(QStringLiteral("description")).toString();
        if (!definition.keyword.isEmpty() && !definition.command.isEmpty()) {
            definitions.append(definition);
        }
    }
    loaded = true;
    return true;
}

QString WorkflowManager::configDirectory() const {
    QString base = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    if (base.isEmpty()) {
        base = QDir::homePath() + QStringLiteral("/.openSpotlightBar");
    }
    return base;
}

QString WorkflowManager::configPath() const {
    return configDirectory() + QStringLiteral("/workflows.json");
}

void WorkflowCommand::execute(const std::vector<std::string> &argument, QListWidget *resultList, QVBoxLayout *, QWidget *) {
    WorkflowManager &manager = WorkflowManager::instance();

    if (argument.empty()) {
        const QList<WorkflowDefinition> defs = manager.workflows();
        if (defs.isEmpty()) {
            resultList->addItem(QStringLiteral("No workflows configured yet. Edit %1 to add your own.").arg(manager.configLocation()));
            return;
        }
        for (const WorkflowDefinition &definition : defs) {
            QString label = QStringLiteral("%1 - %2").arg(definition.keyword, definition.description);
            resultList->addItem(label);
        }
        return;
    }

    QStringList args;
    for (const std::string &value : argument) {
        args << QString::fromStdString(value);
    }

    const QString commandName = args.takeFirst();
    if (commandName.compare(QStringLiteral("list"), Qt::CaseInsensitive) == 0) {
        const QList<WorkflowDefinition> defs = manager.workflows();
        if (defs.isEmpty()) {
            resultList->addItem(QStringLiteral("No workflows configured."));
            return;
        }
        for (const WorkflowDefinition &definition : defs) {
            QString label = QStringLiteral("%1 - %2").arg(definition.keyword, definition.description);
            resultList->addItem(label);
        }
        return;
    }

    if (commandName.compare(QStringLiteral("reload"), Qt::CaseInsensitive) == 0) {
        if (manager.reload()) {
            resultList->addItem(QStringLiteral("Workflows reloaded."));
        } else {
            resultList->addItem(QStringLiteral("Failed to reload workflows. Check %1").arg(manager.configLocation()));
        }
        return;
    }

    QStringList workflowArguments = args;
    QStringList output;
    QStringList errors;
    const bool success = manager.run(commandName, workflowArguments, output, errors);
    if (!output.isEmpty()) {
        for (const QString &line : output) {
            resultList->addItem(line);
        }
    }
    if (!errors.isEmpty()) {
        for (const QString &line : errors) {
            resultList->addItem(QStringLiteral("Error: %1").arg(line));
        }
    }
    if (output.isEmpty() && errors.isEmpty()) {
        resultList->addItem(QStringLiteral("Workflow \"%1\" completed.").arg(commandName));
    } else if (success) {
        resultList->addItem(QStringLiteral("Workflow \"%1\" completed successfully.").arg(commandName));
    }
}
