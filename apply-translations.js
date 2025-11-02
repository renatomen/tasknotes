#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// French translations
const frenchTranslations = {
  stats: {
    filters: {
      allTasks: "Toutes les tâches",
      activeOnly: "Actives uniquement",
      completedOnly: "Terminées uniquement",
    },
    refreshButton: "Actualiser",
    timeRanges: {
      allTime: "Tout le temps",
      last7Days: "7 derniers jours",
      last30Days: "30 derniers jours",
      last90Days: "90 derniers jours",
      customRange: "Plage personnalisée",
    },
    resetFiltersButton: "Réinitialiser les filtres",
    dateRangeFrom: "De",
    dateRangeTo: "À",
    noProject: "Aucun projet",
    cards: {
      timeTrackedEstimated: "Temps suivi / estimé",
      totalTasks: "Total des tâches",
      completionRate: "Taux de complétion",
      activeProjects: "Projets actifs",
      avgTimePerTask: "Temps moyen par tâche",
    },
    labels: {
      tasks: "Tâches",
      completed: "Terminées",
      projects: "Projets",
    },
    noProjectData: "Aucune donnée de projet disponible",
    notAvailable: "N/D",
    noTasks: "Aucune tâche trouvée",
    loading: "Chargement...",
  },
  kanban: {
    uncategorized: "Non catégorisé",
    noProject: "Aucun projet",
    columnTitle: "Sans titre",
  },
  agenda: {
    empty: {
      helpText: "Créez des tâches avec des dates d'échéance ou planifiées, ou ajoutez des notes pour les voir ici.",
    },
    contextMenu: {
      showOverdueSection: "Afficher la section en retard",
      showNotes: "Afficher les notes",
      calendarSubscriptions: "Abonnements au calendrier",
    },
    periods: {
      thisWeek: "Cette semaine",
    },
    tipPrefix: "Astuce : ",
  },
  notes: {
    refreshButton: "Actualiser",
    refreshingButton: "Actualisation...",
    empty: {
      helpText: "Aucune note trouvée pour la date sélectionnée. Essayez de sélectionner une autre date dans la vue Mini Calendrier ou créez des notes.",
    },
    loading: "Chargement des notes...",
    refreshButtonAriaLabel: "Actualiser la liste des notes",
  }
};

// Japanese translations
const japaneseTranslations = {
  stats: {
    filters: {
      allTasks: "すべてのタスク",
      activeOnly: "アクティブのみ",
      completedOnly: "完了のみ",
    },
    refreshButton: "更新",
    timeRanges: {
      allTime: "全期間",
      last7Days: "過去7日間",
      last30Days: "過去30日間",
      last90Days: "過去90日間",
      customRange: "カスタム範囲",
    },
    resetFiltersButton: "フィルターをリセット",
    dateRangeFrom: "開始",
    dateRangeTo: "終了",
    noProject: "プロジェクトなし",
    cards: {
      timeTrackedEstimated: "追跡時間 / 推定時間",
      totalTasks: "合計タスク",
      completionRate: "完了率",
      activeProjects: "アクティブプロジェクト",
      avgTimePerTask: "タスク平均時間",
    },
    labels: {
      tasks: "タスク",
      completed: "完了",
      projects: "プロジェクト",
    },
    noProjectData: "プロジェクトデータがありません",
    notAvailable: "N/A",
    noTasks: "タスクが見つかりません",
    loading: "読み込み中...",
  },
  kanban: {
    uncategorized: "未分類",
    noProject: "プロジェクトなし",
    columnTitle: "無題",
  },
  agenda: {
    empty: {
      helpText: "期限日または予定日を持つタスクを作成するか、ノートを追加してここに表示してください。",
    },
    contextMenu: {
      showOverdueSection: "期限切れセクションを表示",
      showNotes: "ノートを表示",
      calendarSubscriptions: "カレンダー購読",
    },
    periods: {
      thisWeek: "今週",
    },
    tipPrefix: "ヒント：",
  },
  notes: {
    refreshButton: "更新",
    refreshingButton: "更新中...",
    empty: {
      helpText: "選択した日付のノートが見つかりません。ミニカレンダービューで別の日付を選択するか、ノートを作成してください。",
    },
    loading: "ノート読み込み中...",
    refreshButtonAriaLabel: "ノートリストを更新",
  }
};

// Russian translations
const russianTranslations = {
  stats: {
    filters: {
      allTasks: "Все задачи",
      activeOnly: "Только активные",
      completedOnly: "Только завершенные",
    },
    refreshButton: "Обновить",
    timeRanges: {
      allTime: "Всё время",
      last7Days: "Последние 7 дней",
      last30Days: "Последние 30 дней",
      last90Days: "Последние 90 дней",
      customRange: "Пользовательский диапазон",
    },
    resetFiltersButton: "Сбросить фильтры",
    dateRangeFrom: "С",
    dateRangeTo: "По",
    noProject: "Без проекта",
    cards: {
      timeTrackedEstimated: "Отслежено / оценено времени",
      totalTasks: "Всего задач",
      completionRate: "Процент завершения",
      activeProjects: "Активные проекты",
      avgTimePerTask: "Среднее время на задачу",
    },
    labels: {
      tasks: "Задачи",
      completed: "Завершено",
      projects: "Проекты",
    },
    noProjectData: "Нет данных проекта",
    notAvailable: "Н/Д",
    noTasks: "Задачи не найдены",
    loading: "Загрузка...",
  },
  kanban: {
    uncategorized: "Без категории",
    noProject: "Без проекта",
    columnTitle: "Без названия",
  },
  agenda: {
    empty: {
      helpText: "Создайте задачи с датами выполнения или запланированными датами, или добавьте заметки, чтобы увидеть их здесь.",
    },
    contextMenu: {
      showOverdueSection: "Показать секцию просроченных",
      showNotes: "Показать заметки",
      calendarSubscriptions: "Подписки на календари",
    },
    periods: {
      thisWeek: "Эта неделя",
    },
    tipPrefix: "Совет: ",
  },
  notes: {
    refreshButton: "Обновить",
    refreshingButton: "Обновление...",
    empty: {
      helpText: "Заметки для выбранной даты не найдены. Попробуйте выбрать другую дату в виде Мини-календаря или создайте заметки.",
    },
    loading: "Загрузка заметок...",
    refreshButtonAriaLabel: "Обновить список заметок",
  }
};

// Chinese translations
const chineseTranslations = {
  stats: {
    filters: {
      allTasks: "所有任务",
      activeOnly: "仅活动",
      completedOnly: "仅已完成",
    },
    refreshButton: "刷新",
    timeRanges: {
      allTime: "所有时间",
      last7Days: "最近7天",
      last30Days: "最近30天",
      last90Days: "最近90天",
      customRange: "自定义范围",
    },
    resetFiltersButton: "重置过滤器",
    dateRangeFrom: "从",
    dateRangeTo: "到",
    noProject: "无项目",
    cards: {
      timeTrackedEstimated: "已跟踪/估计时间",
      totalTasks: "总任务数",
      completionRate: "完成率",
      activeProjects: "活动项目",
      avgTimePerTask: "平均每任务时间",
    },
    labels: {
      tasks: "任务",
      completed: "已完成",
      projects: "项目",
    },
    noProjectData: "无项目数据",
    notAvailable: "不适用",
    noTasks: "未找到任务",
    loading: "加载中...",
  },
  kanban: {
    uncategorized: "未分类",
    noProject: "无项目",
    columnTitle: "无标题",
  },
  agenda: {
    empty: {
      helpText: "创建具有截止日期或计划日期的任务，或添加笔记以在此处查看它们。",
    },
    contextMenu: {
      showOverdueSection: "显示逾期部分",
      showNotes: "显示笔记",
      calendarSubscriptions: "日历订阅",
    },
    periods: {
      thisWeek: "本周",
    },
    tipPrefix: "提示：",
  },
  notes: {
    refreshButton: "刷新",
    refreshingButton: "刷新中...",
    empty: {
      helpText: "未找到所选日期的笔记。尝试在迷你日历视图中选择不同的日期或创建一些笔记。",
    },
    loading: "加载笔记中...",
    refreshButtonAriaLabel: "刷新笔记列表",
  }
};

console.log('Translation application script created. This demonstrates the pattern.');
console.log('Due to the complexity, manual edits will be more efficient.');
