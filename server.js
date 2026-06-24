const express = require('express');
const multer = require('multer');
const path = require('path');
const { SmartFormParser, SmartFormComparer } = require('./lib/smartform-parser');

const app = express();
const PORT = 3000;

// Configure multer for file uploads (in memory)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/xml' || file.mimetype === 'application/xml' || 
        file.originalname.endsWith('.xml')) {
      cb(null, true);
    } else {
      cb(new Error('Only XML files are allowed'), false);
    }
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API: Parse a single form (for search feature)
app.post('/api/parse-form', upload.single('xmlFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'XML file is required' });
    }

    const xmlString = req.file.buffer.toString('utf-8');
    const form = new SmartFormParser(xmlString, 'search').parse();

    res.json({
      formName: form.header.FORMNAME || req.file.originalname,
      header: form.header,
      interfaceParams: form.interfaceParams,
      globalTypes: form.globalTypes,
      globalData: form.globalData,
      globalCode: form.globalCode,
      properties: form.properties
    });
  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({ error: `Failed to parse: ${error.message}` });
  }
});

// API: Compare two XML files
app.post('/api/compare', upload.fields([
  { name: 'eccFile', maxCount: 1 },
  { name: 's4File', maxCount: 1 }
]), (req, res) => {
  try {
    if (!req.files['eccFile'] || !req.files['s4File']) {
      return res.status(400).json({ error: 'Both ECC and S4 XML files are required' });
    }

    const eccXml = req.files['eccFile'][0].buffer.toString('utf-8');
    const s4Xml = req.files['s4File'][0].buffer.toString('utf-8');

    const eccFileName = req.files['eccFile'][0].originalname;
    const s4FileName = req.files['s4File'][0].originalname;

    // Parse both forms
    const eccForm = new SmartFormParser(eccXml, 'ECC').parse();
    const s4Form = new SmartFormParser(s4Xml, 'S4 HANA').parse();

    // Compare
    const comparer = new SmartFormComparer(eccForm, s4Form);
    const differences = comparer.compare();

    // Build response
    const result = {
      eccFile: {
        name: eccFileName,
        header: eccForm.header,
        stats: {
          interfaceParams: eccForm.interfaceParams.length,
          globalTypes: eccForm.globalTypes.length,
          globalData: eccForm.globalData.length,
          globalCodeLines: eccForm.globalCode.length,
          formProperties: Object.keys(eccForm.properties).length
        }
      },
      s4File: {
        name: s4FileName,
        header: s4Form.header,
        stats: {
          interfaceParams: s4Form.interfaceParams.length,
          globalTypes: s4Form.globalTypes.length,
          globalData: s4Form.globalData.length,
          globalCodeLines: s4Form.globalCode.length,
          formProperties: Object.keys(s4Form.properties).length
        }
      },
      summary: {
        total: differences.length,
        added: differences.filter(d => d.type === 'added').length,
        removed: differences.filter(d => d.type === 'removed').length,
        modified: differences.filter(d => d.type === 'modified').length
      },
      differences: differences,
      // Include all layout properties from both files for full view
      eccProperties: eccForm.properties,
      s4Properties: s4Form.properties,
      // Node lists for missing nodes overview
      eccNodes: eccForm.nodeList,
      s4Nodes: s4Form.nodeList
    };

    res.json(result);
  } catch (error) {
    console.error('Comparison error:', error);
    res.status(500).json({ error: `Failed to compare files: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`\n  SmartForm Comparator is running!`);
  console.log(`  Open in browser: http://localhost:${PORT}\n`);
});
