export interface ProjectEntry {
  basename: string;
  name: string; // with extension
  path: string;
  parent: string;
  title?: string;
  aliases?: string[];
  frontmatter?: Record<string, any>;
}

export interface ResolverDeps {
  getFrontmatter: (entry: ProjectEntry) => Record<string, any> | undefined;
}

export class ProjectMetadataResolver {
  constructor(private deps: ResolverDeps) {}

  resolve(property: string, entry: ProjectEntry): string {
    if (!property) return '';

    if (property.startsWith('file.')) {
      switch (property) {
        case 'file.basename': return entry.basename || '';
        case 'file.name': return entry.name || '';
        case 'file.path': return entry.path || '';
        case 'file.parent': return entry.parent || '';
        default: return '';
      }
    }

    if (property === 'title') {
      return entry.title || '';
    }

    if (property === 'aliases') {
      const list = entry.aliases || [];
      return list.length ? list.join(', ') : '';
    }

    if (property.startsWith('frontmatter:')) {
      const key = property.slice('frontmatter:'.length);
      const fm = this.deps.getFrontmatter(entry) || {};
      const v = fm[key];
      if (Array.isArray(v)) return v.join(', ');
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
      return '';
    }

    return '';
  }
}

