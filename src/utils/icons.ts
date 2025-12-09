import * as fs from 'fs';
import * as path from 'path';

// Icon names mapping to lucide icon files
const iconMap: Record<string, string> = {
  settings: 'settings',
  overlay: 'layout-panel-top',
  add: 'plus',
  edit: 'pencil',
  delete: 'trash-2',
  reset: 'rotate-ccw',
  play: 'play',
  pause: 'pause',
  close: 'x',
  check: 'check',
  gift: 'gift',
  clock: 'clock',
  chevronDown: 'chevron-down',
  chevronUp: 'chevron-up',
  chevronRight: 'chevron-right',
  chevronLeft: 'chevron-left',
  user: 'user',
  calendar: 'calendar',
  sword: 'sword',
  map: 'map-pin',
  skip: 'skip-forward',
  undo: 'undo-2'
};

// Cache for loaded icons
const iconCache: Record<string, string> = {};

// Get path to lucide icons
function getIconPath(name: string): string {
  // Try to find the icons relative to the project root
  const possiblePaths = [
    path.join(__dirname, '../../node_modules/lucide-static/icons', `${name}.svg`),
    path.join(__dirname, '../../../node_modules/lucide-static/icons', `${name}.svg`),
    path.join(process.cwd(), 'node_modules/lucide-static/icons', `${name}.svg`)
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return possiblePaths[0];
}

// Load an icon SVG by name
export function getIcon(name: keyof typeof iconMap, className = 'icon-svg'): string {
  const iconName = iconMap[name] || name;
  const cacheKey = `${iconName}-${className}`;

  if (iconCache[cacheKey]) {
    return iconCache[cacheKey];
  }

  try {
    const iconPath = getIconPath(iconName);
    let svg = fs.readFileSync(iconPath, 'utf8');

    // Add class to SVG
    svg = svg.replace('<svg', `<svg class="${className}"`);

    iconCache[cacheKey] = svg;
    return svg;
  } catch (error) {
    console.error(`Failed to load icon: ${iconName}`, error);
    return '';
  }
}

// Load all icons and return as object (for preloading in renderer)
export function getAllIcons(): Record<string, string> {
  const icons: Record<string, string> = {};

  for (const key of Object.keys(iconMap)) {
    icons[key] = getIcon(key as keyof typeof iconMap);
  }

  return icons;
}

// Export icon map for reference
export { iconMap };
