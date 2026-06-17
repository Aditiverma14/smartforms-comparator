const { XMLParser } = require('fast-xml-parser');

class SmartFormParser {
  constructor(xmlString, systemLabel = '') {
    this.xmlString = xmlString;
    this.systemLabel = systemLabel;
    this.header = {};
    this.interfaceParams = [];
    this.globalTypes = [];
    this.globalData = [];
    this.globalCode = [];
    this.properties = {};
    this.nodeList = []; // Track all nodes (pages, windows, text, code, etc.)
  }

  parse() {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      allowBooleanAttributes: true,
      parseTagValue: false,
      trimValues: true,
      preserveOrder: false,
      isArray: (name) => {
        return ['item', 'sf:item', 'sf:NODE'].includes(name);
      }
    });

    const parsed = parser.parse(this.xmlString);
    const smartform = parsed['sf:SMARTFORM'] || parsed['SMARTFORM'] || {};

    this._parseHeader(smartform);
    this._parseInterface(smartform);
    this._parseGlobalTypes(smartform);
    this._parseGlobalData(smartform);
    this._parseGlobalCode(smartform);
    this._parseFormLayout(smartform);

    return this;
  }

  _parseFormLayout(smartform) {
    const varheader = smartform['sf:VARHEADER'] || smartform['VARHEADER'] || {};
    const items = this._ensureArray(varheader['sf:item'] || varheader['item']);
    if (items.length === 0) return;

    const root = items[0];
    // Form-level settings
    if (root['PAGEFORMAT']) this.properties['Form > Page Format'] = String(root['PAGEFORMAT']);
    if (root['CPI']) this.properties['Form > Characters Per Inch'] = String(root['CPI']);
    if (root['LPI']) this.properties['Form > Lines Per Inch'] = String(root['LPI']);
    if (root['STDSTYLE']) this.properties['Form > Style'] = String(root['STDSTYLE']);

    // Walk the page tree
    const pagetree = root['sf:PAGETREE'] || root['PAGETREE'];
    if (pagetree) {
      const nodes = this._ensureArray(pagetree['sf:NODE'] || pagetree['NODE']);
      nodes.forEach(node => this._walkNode(node, 'Form'));
    }
  }

  _walkNode(node, breadcrumb) {
    if (!node || typeof node !== 'object') return;

    const nodeType = node['NODETYPE'] || '';
    const obj = node['sf:OBJ'] || node['OBJ'] || {};
    let currentBreadcrumb = breadcrumb;

    // Identify what this node is and get a readable name
    const identified = this._identifyNode(nodeType, obj);
    if (identified) {
      currentBreadcrumb = `${breadcrumb} > ${identified.label}`;

      // Track this node in the node list
      this.nodeList.push({
        path: currentBreadcrumb,
        type: identified.type,
        label: identified.label
      });

      // Extract the node's own properties
      this._extractNodeProperties(identified.type, identified.obj, currentBreadcrumb);
    }

    // Extract OUTPUT ATTRIBUTES (position, size) for this node
    const outattr = node['sf:OUTATTR'] || node['OUTATTR'];
    if (outattr) {
      this._extractOutAttr(outattr, currentBreadcrumb);
    }

    // Extract CONDITION on this node
    const cond = node['sf:COND'] || node['COND'];
    if (cond) {
      this._extractCondition(cond, currentBreadcrumb);
    }

    // Walk into successor nodes
    const succ = node['sf:SUCC'] || node['SUCC'];
    if (succ) {
      const succItems = this._ensureArray(succ['sf:item'] || succ['item']);
      succItems.forEach(item => {
        const innerNodes = this._ensureArray(item['sf:NODE'] || item['NODE']);
        innerNodes.forEach(innerNode => {
          this._walkNode(innerNode, currentBreadcrumb);
        });
      });
    }

    // Walk inside window's PROC_CTRL
    if (identified && identified.type === 'WINDOW') {
      const win = identified.obj;
      const procCtrl = win['sf:PROC_CTRL'] || win['PROC_CTRL'];
      if (procCtrl) {
        // PROC_CTRL has a root NODE
        const pcNodes = this._ensureArray(procCtrl['sf:NODE'] || procCtrl['NODE']);
        pcNodes.forEach(pcNode => this._walkNode(pcNode, currentBreadcrumb));
      }
    }

    // Walk inside template/table/loop body
    if (identified && identified.type === 'TEMPLATE') {
      const tmpl = identified.obj;
      const procCtrl = tmpl['sf:PROC_CTRL'] || tmpl['PROC_CTRL'];
      if (procCtrl) {
        const pcNodes = this._ensureArray(procCtrl['sf:NODE'] || procCtrl['NODE']);
        pcNodes.forEach(pcNode => this._walkNode(pcNode, currentBreadcrumb));
      }
    }

    if (identified && identified.type === 'TABLE') {
      const tbl = identified.obj;
      ['sf:HEADER', 'HEADER', 'sf:BODY', 'BODY', 'sf:FOOTER', 'FOOTER'].forEach(key => {
        if (tbl[key] && typeof tbl[key] === 'object') {
          const sectionName = key.replace('sf:', '');
          const sectionNodes = this._ensureArray(tbl[key]['sf:NODE'] || tbl[key]['NODE']);
          sectionNodes.forEach(sn => this._walkNode(sn, `${currentBreadcrumb} > ${sectionName}`));
          // Also check for SUCC pattern
          const sectionSucc = tbl[key]['sf:SUCC'] || tbl[key]['SUCC'];
          if (sectionSucc) {
            const succItems = this._ensureArray(sectionSucc['sf:item'] || sectionSucc['item']);
            succItems.forEach(item => {
              const innerNodes = this._ensureArray(item['sf:NODE'] || item['NODE']);
              innerNodes.forEach(innerNode => this._walkNode(innerNode, `${currentBreadcrumb} > ${sectionName}`));
            });
          }
        }
      });
    }

    if (identified && identified.type === 'LOOP') {
      const loop = identified.obj;
      const procCtrl = loop['sf:PROC_CTRL'] || loop['PROC_CTRL'];
      if (procCtrl) {
        const pcNodes = this._ensureArray(procCtrl['sf:NODE'] || procCtrl['NODE']);
        pcNodes.forEach(pcNode => this._walkNode(pcNode, currentBreadcrumb));
      }
    }
  }

  _identifyNode(nodeType, obj) {
    // PAGE
    const page = obj['sf:PAGE'] || obj['PAGE'];
    if (page) {
      const name = this._getName(page);
      return { type: 'PAGE', label: `Page:${name || 'Unknown'}`, obj: page };
    }

    // WINDOW
    const window = obj['sf:WINDOW'] || obj['WINDOW'];
    if (window) {
      const name = this._getName(window);
      const caption = window['CAPTION'] || '';
      const id = window['@_ID'] || '';
      const label = name || caption || id || 'Unnamed';
      return { type: 'WINDOW', label: `Window:${label.trim()}`, obj: window };
    }

    // TEXT
    const text = obj['sf:TEXT'] || obj['TEXT'];
    if (text && typeof text === 'object' && (text['NAME'] || text['CAPTION'] || text['STYLE_NAME'])) {
      const name = this._getName(text);
      return { type: 'TEXT', label: `Text:${name || 'Unknown'}`, obj: text };
    }

    // CODE (program logic node)
    const code = obj['sf:CODE'] || obj['CODE'];
    if (code) {
      const name = this._getName(code);
      return { type: 'CODE', label: `Code:${name || 'Unknown'}`, obj: code };
    }

    // TEMPLATE
    const template = obj['sf:TEMPLATE'] || obj['TEMPLATE'];
    if (template) {
      const name = this._getName(template);
      return { type: 'TEMPLATE', label: `Template:${name || 'Unknown'}`, obj: template };
    }

    // TABLE
    const table = obj['sf:TABLE'] || obj['TABLE'];
    if (table) {
      const name = this._getName(table);
      return { type: 'TABLE', label: `Table:${name || 'Unknown'}`, obj: table };
    }

    // LOOP
    const loop = obj['sf:LOOP'] || obj['LOOP'];
    if (loop) {
      const name = this._getName(loop);
      return { type: 'LOOP', label: `Loop:${name || 'Unknown'}`, obj: loop };
    }

    // GRAPHIC
    const graphic = obj['sf:GRAPHIC'] || obj['GRAPHIC'];
    if (graphic) {
      const name = this._getName(graphic);
      return { type: 'GRAPHIC', label: `Graphic:${name || 'Unknown'}`, obj: graphic };
    }

    // ADDRESS
    const address = obj['sf:ADDRESS'] || obj['ADDRESS'];
    if (address) {
      const name = this._getName(address);
      return { type: 'ADDRESS', label: `Address:${name || 'Unknown'}`, obj: address };
    }

    // ALTERNATIVE / CONDITION
    const alt = obj['sf:ALTERNATIVE'] || obj['ALTERNATIVE'];
    if (alt) {
      const name = this._getName(alt);
      return { type: 'ALTERNATIVE', label: `Alt:${name || 'Unknown'}`, obj: alt };
    }

    // FOLDER
    const folder = obj['sf:FOLDER'] || obj['FOLDER'];
    if (folder) {
      const name = this._getName(folder);
      return { type: 'FOLDER', label: `Folder:${name || 'Unknown'}`, obj: folder };
    }

    return null;
  }

  _extractNodeProperties(type, obj, breadcrumb) {
    switch (type) {
      case 'PAGE':
        this._recordSimpleProps(obj, breadcrumb, ['NEXTPAGE', 'NUMB_MODE', 'NUMB_TYPE', 'PRINTMODE', 'PAGEORTN']);
        // Background
        const bg = obj['sf:BACKGROUND'] || obj['BACKGROUND'];
        if (bg) {
          const gfx = bg['sf:GRAPHIC'] || bg['GRAPHIC'];
          if (gfx) this._extractGraphicProps(gfx, `${breadcrumb} > Background`);
        }
        break;

      case 'WINDOW':
        this._recordSimpleProps(obj, breadcrumb, ['WTYPE']);
        break;

      case 'TEXT':
        this._recordSimpleProps(obj, breadcrumb, ['STYLE_NAME', 'APPMODE']);
        // Text area
        const ta = obj['TEXT_AREA'];
        if (ta && typeof ta === 'object') {
          this._recordSimpleProps(ta, `${breadcrumb} > TextArea`, ['ENABLED', 'NCOLS', 'NROWS']);
        }
        // Text content
        const textBlock = obj['TEXT'];
        if (textBlock && typeof textBlock === 'object') {
          const items = this._ensureArray(textBlock['item'] || textBlock['sf:item']);
          const lines = [];
          items.forEach(item => {
            if (typeof item === 'object' && item !== null) {
              const fmt = item['TDFORMAT'] || '';
              const line = item['TDLINE'] || '';
              lines.push(`[${fmt}] ${line}`);
            }
          });
          if (lines.length > 0) {
            this.properties[`${breadcrumb} > Content`] = lines.join('\n');
          }
        }
        break;

      case 'CODE':
        // Extract program lines
        const coding = obj['CODE'] || obj['CODING'] || obj['sf:CODING'];
        if (coding && typeof coding === 'object') {
          const items = this._ensureArray(coding['item'] || coding['sf:item']);
          const lines = items.map(i => this._itemToString(i));
          if (lines.length > 0) {
            this.properties[`${breadcrumb} > Program Lines`] = lines.join('\n');
          }
        }
        break;

      case 'TEMPLATE':
        // Template lines
        const tline = obj['sf:TLINE'] || obj['TLINE'];
        if (tline && typeof tline === 'object') {
          const items = this._ensureArray(tline['item'] || tline['sf:item']);
          items.forEach((item, idx) => {
            if (typeof item === 'object' && item !== null) {
              Object.keys(item).forEach(k => {
                if (typeof item[k] !== 'object') {
                  this.properties[`${breadcrumb} > Line[${idx + 1}].${k}`] = String(item[k]);
                }
              });
            }
          });
        }
        // Template columns
        const tcol = obj['sf:TCOL'] || obj['TCOL'];
        if (tcol && typeof tcol === 'object') {
          const items = this._ensureArray(tcol['item'] || tcol['sf:item']);
          items.forEach((item, idx) => {
            if (typeof item === 'object' && item !== null) {
              Object.keys(item).forEach(k => {
                if (typeof item[k] !== 'object') {
                  this.properties[`${breadcrumb} > Col[${idx + 1}].${k}`] = String(item[k]);
                }
              });
            }
          });
        }
        break;

      case 'TABLE':
        this._recordSimpleProps(obj, breadcrumb, ['TABNAME', 'WANAME', 'FROMVAR', 'TOVAR']);
        break;

      case 'LOOP':
        this._recordSimpleProps(obj, breadcrumb, ['TABNAME', 'WANAME', 'FROMVAR', 'TOVAR', 'DESCENDING']);
        break;

      case 'GRAPHIC':
        this._extractGraphicProps(obj, breadcrumb);
        break;

      case 'ALTERNATIVE':
        this._recordSimpleProps(obj, breadcrumb, ['TRUEACTION', 'FALSEACTION']);
        break;
    }
  }

  _extractOutAttr(outattr, breadcrumb) {
    // Unwrap nested OUTATTR
    let target = outattr;
    if (target['sf:OUTATTR']) target = target['sf:OUTATTR'];
    else if (target['OUTATTR'] && typeof target['OUTATTR'] === 'object') target = target['OUTATTR'];

    // If the OUTATTR has a NAME, append it to breadcrumb for clarity
    const oaName = this._getName(target);
    const finalCrumb = oaName ? `${breadcrumb} (${oaName})` : breadcrumb;

    // Position & size
    const dims = { 'WLEFT': 'Left', 'WWIDTH': 'Width', 'WTOP': 'Top', 'WHEIGHT': 'Height' };
    Object.keys(dims).forEach(prop => {
      if (target[prop] !== undefined && target[prop] !== null && target[prop] !== '') {
        this.properties[`${finalCrumb} > ${dims[prop]} (${prop})`] = String(target[prop]);
      }
    });

    // Units
    const units = { 'U_WLEFT': 'Left Unit', 'U_WWIDTH': 'Width Unit', 'U_WTOP': 'Top Unit', 'U_WHEIGHT': 'Height Unit' };
    Object.keys(units).forEach(prop => {
      if (target[prop] !== undefined && target[prop] !== null && target[prop] !== '') {
        this.properties[`${finalCrumb} > ${units[prop]} (${prop})`] = String(target[prop]);
      }
    });

    // Borders
    const border = target['BORDER'];
    if (border && typeof border === 'object') {
      const sides = { 'LEFTATTR': 'Left', 'TOPATTR': 'Top', 'RIGHTATTR': 'Right', 'BOTTOMATTR': 'Bottom' };
      Object.keys(sides).forEach(sideKey => {
        const side = border[sideKey];
        if (side && typeof side === 'object') {
          const sn = sides[sideKey];
          if (side['THICKNESS'] !== undefined) this.properties[`${finalCrumb} > Border.${sn}.Thickness`] = String(side['THICKNESS']);
          if (side['THICKNESSU'] !== undefined) this.properties[`${finalCrumb} > Border.${sn}.ThicknessUnit`] = String(side['THICKNESSU']);
          if (side['DISTANCE'] !== undefined) this.properties[`${finalCrumb} > Border.${sn}.Distance`] = String(side['DISTANCE']);
          if (side['DISTANCEU'] !== undefined) this.properties[`${finalCrumb} > Border.${sn}.DistanceUnit`] = String(side['DISTANCEU']);
          const color = side['COLOR'];
          if (color && typeof color === 'object') {
            this.properties[`${finalCrumb} > Border.${sn}.Color`] = `R:${color['RED'] || '0'} G:${color['GREEN'] || '0'} B:${color['BLUE'] || '0'} T:${color['TRANS'] || '0'}`;
          }
        }
      });
    }

    // Shading
    const shading = target['SHADING'];
    if (shading && typeof shading === 'object') {
      const fillColor = shading['FILLCOLOR'];
      if (fillColor && typeof fillColor === 'object') {
        this.properties[`${finalCrumb} > Shading.Color`] = `R:${fillColor['RED'] || '0'} G:${fillColor['GREEN'] || '0'} B:${fillColor['BLUE'] || '0'}`;
      }
      if (shading['INTENSITY'] !== undefined) this.properties[`${finalCrumb} > Shading.Intensity`] = String(shading['INTENSITY']);
    }
  }

  _extractCondition(cond, breadcrumb) {
    const condition = cond['sf:CONDITION'] || cond['CONDITION'];
    if (!condition) return;

    const name = this._getName(condition);
    const condCrumb = `${breadcrumb} > Condition:${name || 'Unknown'}`;

    const condBlock = condition['COND'];
    if (condBlock && typeof condBlock === 'object') {
      const items = this._ensureArray(condBlock['item'] || condBlock['sf:item']);
      items.forEach((item, idx) => {
        if (typeof item === 'object' && item !== null) {
          const op1 = item['OP1'] || '';
          const cop = item['COP'] || '';
          const op2 = item['OP2'] || '';
          this.properties[`${condCrumb} > Rule[${idx + 1}]`] = `${op1} ${cop} ${op2}`.trim();
        }
      });
    }
  }

  _extractGraphicProps(gfx, breadcrumb) {
    const name = this._getName(gfx);
    const gfxCrumb = name ? `${breadcrumb} > Graphic:${name}` : breadcrumb;

    this._recordSimpleProps(gfx, gfxCrumb, ['GTYPE', 'APPMODE', 'RELMODE', 'ALIGNMENT', 'U_SB', 'U_SA']);

    const bgrExt = gfx['BGR_EXT'];
    if (bgrExt && typeof bgrExt === 'object') {
      Object.keys(bgrExt).forEach(k => {
        if (typeof bgrExt[k] !== 'object') {
          this.properties[`${gfxCrumb} > ${k}`] = String(bgrExt[k]);
        }
      });
    }

    const gkeybds = gfx['GKEYBDS'];
    if (gkeybds && typeof gkeybds === 'object') {
      Object.keys(gkeybds).forEach(k => {
        if (typeof gkeybds[k] !== 'object') {
          this.properties[`${gfxCrumb} > Key.${k}`] = String(gkeybds[k]);
        }
      });
    }
  }

  _recordSimpleProps(obj, breadcrumb, keys) {
    keys.forEach(k => {
      if (obj[k] !== undefined && obj[k] !== null && typeof obj[k] !== 'object') {
        this.properties[`${breadcrumb} > ${k}`] = String(obj[k]);
      }
    });
  }

  _getName(obj) {
    if (!obj) return '';
    const nameObj = obj['NAME'] || obj['sf:NAME'];
    if (nameObj && typeof nameObj === 'object') return String(nameObj['INAME'] || '');
    if (typeof nameObj === 'string') return nameObj;
    if (obj['INAME']) return String(obj['INAME']);
    return '';
  }

  _itemToString(item) {
    if (typeof item === 'string' || typeof item === 'number') return String(item);
    if (item === null || item === undefined) return '';
    if (typeof item === 'object' && item['#text'] !== undefined) return String(item['#text']);
    return '';
  }

  _ensureArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return [val];
  }

  // --- Structured data parsers (same as before) ---
  _parseHeader(smartform) {
    const header = smartform['HEADER'] || {};
    ['FORMNAME', 'CAPTION', 'MASTERLANG', 'DEVCLASS', 'VERSION',
     'FIRSTUSER', 'FIRSTDATE', 'FIRSTTIME', 'LASTUSER', 'LASTDATE',
     'LASTTIME', 'LANGVECTOR'].forEach(f => {
      if (header[f] !== undefined) this.header[f] = String(header[f]);
    });
  }

  _parseInterface(smartform) {
    const iface = smartform['INTERFACE'] || {};
    const items = this._ensureArray(iface['item'] || iface['sf:item']);
    items.forEach(item => {
      if (typeof item === 'object' && item !== null) {
        const param = {};
        Object.keys(item).forEach(key => {
          if (typeof item[key] !== 'object') param[key] = String(item[key]);
        });
        if (Object.keys(param).length > 0) this.interfaceParams.push(param);
      }
    });
  }

  _parseGlobalTypes(smartform) {
    const gtypes = smartform['GTYPES'] || {};
    this._ensureArray(gtypes['item']).forEach(item => {
      this.globalTypes.push(this._itemToString(item));
    });
  }

  _parseGlobalData(smartform) {
    const gdata = smartform['GDATA'] || {};
    this._ensureArray(gdata['item']).forEach(item => {
      if (typeof item === 'object' && item !== null) {
        const data = {};
        Object.keys(item).forEach(key => {
          if (typeof item[key] !== 'object') data[key] = String(item[key]);
        });
        if (Object.keys(data).length > 0) this.globalData.push(data);
      }
    });
  }

  _parseGlobalCode(smartform) {
    const gcoding = smartform['GCODING'] || {};
    this._ensureArray(gcoding['item']).forEach(item => {
      this.globalCode.push(this._itemToString(item));
    });
  }
}


class SmartFormComparer {
  constructor(form1, form2) {
    this.form1 = form1;
    this.form2 = form2;
    this.differences = [];
  }

  compare() {
    this._compareHeader();
    this._compareInterface();
    this._compareGlobalTypes();
    this._compareGlobalData();
    this._compareGlobalCode();
    this._compareProperties();
    this._compareMissingNodes();
    return this.differences;
  }

  _addDiff(category, location, type, detail, oldValue = null, newValue = null) {
    this.differences.push({ category, location, type, detail, oldValue, newValue });
  }

  _compareHeader() {
    const skip = ['LASTDATE', 'LASTTIME', 'LASTUSER', 'FIRSTDATE', 'FIRSTTIME', 'FIRSTUSER'];
    const allKeys = new Set([...Object.keys(this.form1.header), ...Object.keys(this.form2.header)]);
    for (const key of [...allKeys].sort()) {
      if (skip.includes(key)) continue;
      const v1 = this.form1.header[key] || '';
      const v2 = this.form2.header[key] || '';
      if (v1 !== v2) this._addDiff('Header', `Header > ${key}`, 'modified', `${key}: "${v1}" → "${v2}"`, v1, v2);
    }
  }

  _compareInterface() {
    const p1 = {}, p2 = {};
    this.form1.interfaceParams.forEach(p => { p1[p.NAME || ''] = p; });
    this.form2.interfaceParams.forEach(p => { p2[p.NAME || ''] = p; });
    const all = new Set([...Object.keys(p1), ...Object.keys(p2)]);
    for (const name of [...all].sort()) {
      if (!name) continue;
      if (!p1[name]) {
        this._addDiff('Interface', `Interface > ${name}`, 'added', `Parameter "${name}" added`, null, JSON.stringify(p2[name], null, 2));
      } else if (!p2[name]) {
        this._addDiff('Interface', `Interface > ${name}`, 'removed', `Parameter "${name}" removed`, JSON.stringify(p1[name], null, 2), null);
      } else {
        const attrs = new Set([...Object.keys(p1[name]), ...Object.keys(p2[name])]);
        for (const a of attrs) {
          if ((p1[name][a] || '') !== (p2[name][a] || '')) {
            this._addDiff('Interface', `Interface > ${name} > ${a}`, 'modified',
              `${a}: "${p1[name][a] || ''}" → "${p2[name][a] || ''}"`, p1[name][a] || '', p2[name][a] || '');
          }
        }
      }
    }
  }

  _compareGlobalTypes() {
    if (JSON.stringify(this.form1.globalTypes) !== JSON.stringify(this.form2.globalTypes)) {
      this._addDiff('Global Types', 'Global Types', 'modified', 'Type definitions changed',
        this.form1.globalTypes.join('\n'), this.form2.globalTypes.join('\n'));
    }
  }

  _compareGlobalData() {
    const d1 = {}, d2 = {};
    this.form1.globalData.forEach(d => { d1[d.NAME || ''] = d; });
    this.form2.globalData.forEach(d => { d2[d.NAME || ''] = d; });
    const all = new Set([...Object.keys(d1), ...Object.keys(d2)]);
    for (const name of [...all].sort()) {
      if (!name) continue;
      if (!d1[name]) {
        this._addDiff('Global Data', `Global Data > ${name}`, 'added', `Variable "${name}" added`, null, JSON.stringify(d2[name], null, 2));
      } else if (!d2[name]) {
        this._addDiff('Global Data', `Global Data > ${name}`, 'removed', `Variable "${name}" removed`, JSON.stringify(d1[name], null, 2), null);
      } else {
        const attrs = new Set([...Object.keys(d1[name]), ...Object.keys(d2[name])]);
        for (const a of attrs) {
          if ((d1[name][a] || '') !== (d2[name][a] || '')) {
            this._addDiff('Global Data', `Global Data > ${name} > ${a}`, 'modified',
              `${a}: "${d1[name][a] || ''}" → "${d2[name][a] || ''}"`, d1[name][a] || '', d2[name][a] || '');
          }
        }
      }
    }
  }

  _compareGlobalCode() {
    if (JSON.stringify(this.form1.globalCode) !== JSON.stringify(this.form2.globalCode)) {
      this._addDiff('Global Code', 'Global Code', 'modified', 'Initialization code changed',
        this.form1.globalCode.join('\n'), this.form2.globalCode.join('\n'));
    }
  }

  _compareProperties() {
    const props1 = this.form1.properties;
    const props2 = this.form2.properties;
    const allPaths = new Set([...Object.keys(props1), ...Object.keys(props2)]);

    for (const path of [...allPaths].sort()) {
      const v1 = props1[path];
      const v2 = props2[path];
      const category = this._categorize(path);

      if (v1 === undefined && v2 !== undefined) {
        this._addDiff(category, path, 'added', `Added in S4`, null, v2);
      } else if (v1 !== undefined && v2 === undefined) {
        this._addDiff(category, path, 'removed', `Removed in S4`, v1, null);
      } else if (v1 !== v2) {
        if ((v1 || '').length < 80 && (v2 || '').length < 80) {
          this._addDiff(category, path, 'modified', `"${v1}" → "${v2}"`, v1, v2);
        } else {
          this._addDiff(category, path, 'modified', 'Content changed', v1, v2);
        }
      }
    }
  }

  /**
   * Compare node lists to find nodes completely missing from one side
   */
  _compareMissingNodes() {
    const paths1 = new Set(this.form1.nodeList.map(n => n.path));
    const paths2 = new Set(this.form2.nodeList.map(n => n.path));

    // Nodes in ECC but not in S4
    this.form1.nodeList.forEach(node => {
      if (!paths2.has(node.path)) {
        this._addDiff('Missing Nodes', node.path, 'removed',
          `${node.type} "${node.label}" exists in ECC but missing in S4`,
          `Node Type: ${node.type}\nPath: ${node.path}`, null);
      }
    });

    // Nodes in S4 but not in ECC
    this.form2.nodeList.forEach(node => {
      if (!paths1.has(node.path)) {
        this._addDiff('Missing Nodes', node.path, 'added',
          `${node.type} "${node.label}" exists in S4 but missing in ECC`,
          null, `Node Type: ${node.type}\nPath: ${node.path}`);
      }
    });
  }

  _categorize(path) {
    const p = path.toUpperCase();
    if (p.includes('HEIGHT') || p.includes('WIDTH') || p.includes('(WTOP)') ||
        p.includes('(WLEFT)') || p.includes('LEFT (') || p.includes('TOP (') ||
        p.includes('UNIT')) {
      return 'Layout & Dimensions';
    }
    if (p.includes('BORDER') || p.includes('SHADING') || p.includes('COLOR')) {
      return 'Borders & Colors';
    }
    if (p.includes('CONTENT') || p.includes('TDLINE') || p.includes('T_TEXT')) {
      return 'Text Content';
    }
    if (p.includes('PROGRAM') || p.includes('CODE:')) {
      return 'Program Code';
    }
    if (p.includes('CONDITION')) {
      return 'Conditions';
    }
    if (p.includes('TEMPLATE') || p.includes('TABLE') || p.includes('COL[') || p.includes('LINE[')) {
      return 'Tables & Templates';
    }
    if (p.includes('LOOP')) {
      return 'Loops';
    }
    if (p.includes('GRAPHIC') || p.includes('BACKGROUND')) {
      return 'Graphics';
    }
    if (p.includes('STYLE') || p.includes('APPMODE') || p.includes('TEXTAREA')) {
      return 'Styles';
    }
    if (p.includes('PAGE') && (p.includes('NEXTPAGE') || p.includes('PRINTMODE') || p.includes('PAGEORTN') || p.includes('FORMAT'))) {
      return 'Page Settings';
    }
    if (p.includes('WTYPE')) {
      return 'Window Properties';
    }
    return 'Form Structure';
  }
}

module.exports = { SmartFormParser, SmartFormComparer };
