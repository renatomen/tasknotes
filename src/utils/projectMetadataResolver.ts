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

  private stringifyFmValue(value: any): string {
    if (value == null) return '';
    if (Array.isArray(value)) {
      const parts = value.map(v => this.stringifyFmValue(v)).filter(Boolean);
      return parts.join(', ');
    }
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') return String(value);
    // Obsidian frontmatter links are objects with a path field
    if (t === 'object') {
      const anyVal = value as any;
      if (typeof anyVal.path === 'string') {
        const p = anyVal.path as string;
        const base = p.split('/').pop() || p;
        return base.replace(/\.md$/, '');
      }
      // Unknown object types are not rendered
      return '';
    }
    return '';
  }

  resolve(property: string, entry: ProjectEntry): string {
    if (!property) return '';

    // File-scoped properties must be explicitly prefixed
    if (property.startsWith('file.')) {
      switch (property) {
        case 'file.basename': return entry.basename || '';
        case 'file.name': return entry.name || '';
        case 'file.path': return entry.path || '';
        case 'file.parent': return entry.parent || '';
        default: return '';
      }
    }

    // Convenience: title and aliases are commonly derived/transformed
    if (property === 'title') {
      return entry.title || '';
    }
    if (property === 'aliases') {
      const list = entry.aliases || [];
      return list.length ? list.join(', ') : '';
    }

    // Backward compatibility: explicit frontmatter prefix still supported
    let key = property;
    if (property.startsWith('frontmatter:')) {
      key = property.slice('frontmatter:'.length);
    }

    // Default: any non-file.* token resolves from frontmatter
    const fm = this.deps.getFrontmatter(entry) || {};
    return this.stringifyFmValue(fm[key]);
  }
}

