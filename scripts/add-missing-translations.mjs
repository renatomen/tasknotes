import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESOURCES_DIR = path.resolve(__dirname, '../src/i18n/resources');

// Helper to build nested object from dot notation
function setNestedValue(obj, pathStr, value) {
  const parts = pathStr.split('.');
  const last = parts.pop();
  let current = obj;
  for (const part of parts) {
    if (!current[part]) {
      current[part] = {};
    }
    current = current[part];
  }
  current[last] = value;
}

// Helper to get nested value
function getNestedValue(obj, pathStr) {
  const parts = pathStr.split('.');
  let current = obj;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

// Parse TypeScript object to JavaScript object (simple version)
function parseTS File(content, locale) {
  // Remove imports and type exports
  content = content.replace(/^import\s+.*?;$/gm, '');
  content = content.replace(/export\s+type\s+.*?;$/gm, '');

  // Convert to module export
  content = content.replace(
    new RegExp(`export\\s+const\\s+${locale}\\s*:\\s*\\w+\\s*=\\s*`, 'g'),
    'export default '
  );
  content = content.replace(
    new RegExp(`export\\s+const\\s+${locale}\\s*=\\s*`, 'g'),
    'export default '
  );

  const tempPath = path.join(RESOURCES_DIR, `.${locale}.temp.mjs`);
  fs.writeFileSync(tempPath, content);

  try {
    const absolutePath = path.resolve(tempPath);
    const module = await import(`file://${absolutePath}?v=${Date.now()}`);
    return module.default;
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

// Convert object back to TypeScript string
function objectToTS(obj, indent = '\t', level = 1) {
  const entries = [];
  const currentIndent = indent.repeat(level);
  const nextIndent = indent.repeat(level + 1);

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Escape special characters
      const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t');
      entries.push(`${currentIndent}${key}: "${escaped}",`);
    } else if (typeof value === 'object' && value !== null) {
      entries.push(`${currentIndent}${key}: {`);
      entries.push(objectToTS(value, indent, level + 1));
      entries.push(`${currentIndent}},`);
    }
  }

  return entries.join('\n');
}

// Translation mappings
const translations = {
  fr: {
    "views.notes.refreshingButton": "Actualisation...",
    "views.notes.empty.helpText": "Aucune note trouvée pour la date sélectionnée. Essayez de sélectionner une date différente dans la vue Mini Calendrier ou créez quelques notes.",
    "views.notes.loading": "Chargement des notes...",
    "views.notes.refreshButtonAriaLabel": "Actualiser la liste des notes",
    "notices.icsNoteCreatedSuccess": "Note créée avec succès",
    "notices.icsCreationModalOpenFailed": "Échec de l'ouverture de la modale de création",
    "notices.icsNoteLinkSuccess": "Note \"{fileName}\" liée à l'événement ICS",
    "notices.icsTaskCreatedSuccess": "Tâche créée : {title}",
    "notices.icsRelatedItemsRefreshed": "Notes associées actualisées",
    "notices.icsFileNotFound": "Fichier introuvable ou invalide",
    "notices.icsFileOpenFailed": "Échec de l'ouverture du fichier",
    "notices.timeblockAttachmentExists": "\"{fileName}\" est déjà attaché",
    "notices.timeblockAttachmentAdded": "\"{fileName}\" ajouté comme pièce jointe",
    "notices.timeblockAttachmentRemoved": "\"{fileName}\" retiré des pièces jointes",
    "notices.timeblockFileTypeNotSupported": "Impossible d'ouvrir \"{fileName}\" - type de fichier non pris en charge",
    "notices.timeblockTitleRequired": "Veuillez saisir un titre pour le bloc de temps",
    "notices.timeblockUpdatedSuccess": "Bloc de temps \"{title}\" mis à jour avec succès",
    "notices.timeblockUpdateFailed": "Échec de la mise à jour du bloc de temps. Consultez la console pour plus de détails.",
    "notices.timeblockDeletedSuccess": "Bloc de temps \"{title}\" supprimé avec succès",
    "notices.timeblockDeleteFailed": "Échec de la suppression du bloc de temps. Consultez la console pour plus de détails.",
    "notices.timeblockRequiredFieldsMissing": "Veuillez remplir tous les champs requis",
    "notices.agendaLoadingFailed": "Erreur lors du chargement de l'agenda. Veuillez essayer d'actualiser.",
    "notices.statsLoadingFailed": "Erreur lors du chargement des détails du projet.",
    "modals.deviceCode.title": "Autorisation Google Calendar",
    "modals.deviceCode.instructions.intro": "Pour connecter votre Google Calendar, veuillez suivre ces étapes :",
    "modals.deviceCode.steps.open": "Ouvrir",
    "modals.deviceCode.steps.inBrowser": "dans votre navigateur",
    "modals.deviceCode.steps.enterCode": "Entrez ce code lorsque demandé :",
    "modals.deviceCode.steps.signIn": "Connectez-vous avec votre compte Google et accordez l'accès",
    "modals.deviceCode.steps.returnToObsidian": "Retournez à Obsidian (cette fenêtre se fermera automatiquement)",
    "modals.deviceCode.codeLabel": "Votre code :",
    "modals.deviceCode.copyCodeAriaLabel": "Copier le code",
    "modals.deviceCode.waitingForAuthorization": "En attente d'autorisation...",
    "modals.deviceCode.openBrowserButton": "Ouvrir le navigateur",
    "modals.deviceCode.cancelButton": "Annuler",
    "modals.deviceCode.expiresMinutesSeconds": "Le code expire dans {minutes}m {seconds}s",
    "modals.deviceCode.expiresSeconds": "Le code expire dans {seconds}s",
    "modals.icsEventInfo.calendarEventHeading": "Événement de calendrier",
    "modals.icsEventInfo.titleLabel": "Titre",
    "modals.icsEventInfo.calendarLabel": "Calendrier",
    "modals.icsEventInfo.dateTimeLabel": "Date et heure",
    "modals.icsEventInfo.locationLabel": "Lieu",
    "modals.icsEventInfo.descriptionLabel": "Description",
    "modals.icsEventInfo.urlLabel": "URL",
    "modals.icsEventInfo.relatedNotesHeading": "Notes et tâches associées",
    "modals.icsEventInfo.noRelatedItems": "Aucune note ou tâche associée trouvée pour cet événement.",
    "modals.icsEventInfo.typeTask": "Tâche",
    "modals.icsEventInfo.typeNote": "Note",
    "modals.icsEventInfo.actionsHeading": "Actions",
    "modals.icsEventInfo.createFromEventLabel": "Créer à partir de l'événement",
    "modals.icsEventInfo.createFromEventDesc": "Créer une nouvelle note ou tâche à partir de cet événement de calendrier",
    "modals.icsEventInfo.linkExistingLabel": "Lier existant",
    "modals.icsEventInfo.linkExistingDesc": "Lier une note existante à cet événement de calendrier",
    "modals.timeblockInfo.editHeading": "Modifier le bloc de temps",
    "modals.timeblockInfo.dateTimeLabel": "Date et heure : ",
    "modals.timeblockInfo.titleLabel": "Titre",
    "modals.timeblockInfo.titleDesc": "Titre de votre bloc de temps",
    "modals.timeblockInfo.titlePlaceholder": "ex., Session de travail approfondi",
    "modals.timeblockInfo.descriptionLabel": "Description",
    "modals.timeblockInfo.descriptionDesc": "Description optionnelle du bloc de temps",
    "modals.timeblockInfo.descriptionPlaceholder": "Concentrez-vous sur les nouvelles fonctionnalités, sans interruptions",
    "modals.timeblockInfo.colorLabel": "Couleur",
    "modals.timeblockInfo.colorDesc": "Couleur optionnelle pour le bloc de temps",
    "modals.timeblockInfo.colorPlaceholder": "#3b82f6",
    "modals.timeblockInfo.attachmentsLabel": "Pièces jointes",
    "modals.timeblockInfo.attachmentsDesc": "Fichiers ou notes liés à ce bloc de temps",
    "modals.timeblockInfo.addAttachmentButton": "Ajouter une pièce jointe",
    "modals.timeblockInfo.addAttachmentTooltip": "Sélectionnez un fichier ou une note en utilisant la recherche floue",
    "modals.timeblockInfo.deleteButton": "Supprimer le bloc de temps",
    "modals.timeblockInfo.saveButton": "Enregistrer les modifications",
    "modals.timeblockInfo.deleteConfirmationTitle": "Supprimer le bloc de temps",
    "modals.timeblockCreation.heading": "Créer un bloc de temps",
    "modals.timeblockCreation.dateLabel": "Date : ",
    "modals.timeblockCreation.titleLabel": "Titre",
    "modals.timeblockCreation.titleDesc": "Titre de votre bloc de temps",
    "modals.timeblockCreation.titlePlaceholder": "ex., Session de travail approfondi",
    "modals.timeblockCreation.startTimeLabel": "Heure de début",
    "modals.timeblockCreation.startTimeDesc": "Quand le bloc de temps commence",
    "modals.timeblockCreation.startTimePlaceholder": "09:00",
    "modals.timeblockCreation.endTimeLabel": "Heure de fin",
    "modals.timeblockCreation.endTimeDesc": "Quand le bloc de temps se termine",
    "modals.timeblockCreation.endTimePlaceholder": "11:00",
    "modals.timeblockCreation.descriptionLabel": "Description",
    "modals.timeblockCreation.descriptionDesc": "Description optionnelle du bloc de temps",
    "modals.timeblockCreation.descriptionPlaceholder": "Concentrez-vous sur les nouvelles fonctionnalités, sans interruptions",
    "modals.timeblockCreation.colorLabel": "Couleur",
    "modals.timeblockCreation.colorDesc": "Couleur optionnelle pour le bloc de temps",
    "modals.timeblockCreation.colorPlaceholder": "#3b82f6",
    "modals.timeblockCreation.attachmentsLabel": "Pièces jointes",
    "modals.timeblockCreation.attachmentsDesc": "Fichiers ou notes à lier à ce bloc de temps",
    "modals.timeblockCreation.addAttachmentButton": "Ajouter une pièce jointe",
    "modals.timeblockCreation.addAttachmentTooltip": "Sélectionnez un fichier ou une note en utilisant la recherche floue",
    "modals.timeblockCreation.createButton": "Créer un bloc de temps",
    "modals.icsNoteCreation.heading": "Créer à partir d'un événement ICS",
    "modals.icsNoteCreation.titleLabel": "Titre",
    "modals.icsNoteCreation.titleDesc": "Titre du nouveau contenu",
    "modals.icsNoteCreation.folderLabel": "Dossier",
    "modals.icsNoteCreation.folderDesc": "Dossier de destination (laisser vide pour la racine du coffre)",
    "modals.icsNoteCreation.folderPlaceholder": "dossier/sous-dossier",
    "modals.icsNoteCreation.createButton": "Créer",
    "modals.icsNoteCreation.startLabel": "Début : ",
    "modals.icsNoteCreation.endLabel": "Fin : ",
    "modals.icsNoteCreation.locationLabel": "Lieu : ",
    "modals.icsNoteCreation.calendarLabel": "Calendrier : ",
    "modals.icsNoteCreation.useTemplateLabel": "Utiliser un modèle",
    "modals.icsNoteCreation.useTemplateDesc": "Appliquer un modèle lors de la création du contenu",
    "modals.icsNoteCreation.templatePathLabel": "Chemin du modèle",
    "modals.icsNoteCreation.templatePathDesc": "Chemin vers le fichier de modèle",
    "modals.icsNoteCreation.templatePathPlaceholder": "templates/ics-note-template.md",
    "ui.filterBar.subgroupLabel": "SOUS-GROUPE",
    "components.dateContextMenu.weekdays": "Jours de semaine",
    "components.dateContextMenu.clearDate": "Effacer la date",
    "components.dateContextMenu.today": "Aujourd'hui",
    "components.dateContextMenu.tomorrow": "Demain",
    "components.dateContextMenu.thisWeekend": "Ce week-end",
    "components.dateContextMenu.nextWeek": "La semaine prochaine",
    "components.dateContextMenu.nextMonth": "Le mois prochain",
    "components.dateContextMenu.setDateTime": "Définir la date et l'heure",
    "components.dateContextMenu.dateLabel": "Date",
    "components.dateContextMenu.timeLabel": "Heure (optionnelle)",
    "components.subgroupMenuBuilder.none": "Aucun",
    "components.subgroupMenuBuilder.status": "Statut",
    "components.subgroupMenuBuilder.priority": "Priorité",
    "components.subgroupMenuBuilder.context": "Contexte",
    "components.subgroupMenuBuilder.project": "Projet",
    "components.subgroupMenuBuilder.dueDate": "Date d'échéance",
    "components.subgroupMenuBuilder.scheduledDate": "Date programmée",
    "components.subgroupMenuBuilder.tags": "Étiquettes",
    "components.subgroupMenuBuilder.completedDate": "Date de finalisation",
    "components.subgroupMenuBuilder.subgroup": "SOUS-GROUPE",
  },
};

// Main execution
const locale = process.argv[2];
if (!locale || !translations[locale]) {
  console.error(`Usage: node add-missing-translations.mjs <locale>`);
  console.error(`Available locales: ${Object.keys(translations).join(', ')}`);
  process.exit(1);
}

console.log(`\nAdding missing translations for ${locale}...`);

const filePath = path.join(RESOURCES_DIR, `${locale}.ts`);
const content = fs.readFileSync(filePath, 'utf8');

// Load and parse current translations
const currentObj = await parseTS File(content, locale);

// Add missing translations
let addedCount = 0;
const translationMap = translations[locale];

for (const [key, value] of Object.entries(translationMap)) {
  const existing = getNestedValue(currentObj, key);
  if (existing === undefined) {
    setNestedValue(currentObj, key, value);
    addedCount++;
    console.log(`  ✓ Added: ${key}`);
  } else {
    console.log(`  - Skipped (exists): ${key}`);
  }
}

// Generate new TypeScript content
const newContent = `import type { Translation } from "./en";

export const ${locale}: Translation = {
${objectToTS(currentObj, '\t', 1)}
};

export type ${locale.charAt(0).toUpperCase() + locale.slice(1)}Translation = typeof ${locale};
`;

// Write back
fs.writeFileSync(filePath, newContent);

console.log(`\n✓ Completed ${locale}: Added ${addedCount} translations`);
