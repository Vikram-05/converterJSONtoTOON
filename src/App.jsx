import React, { useState, useCallback, useEffect } from 'react';
import { 
  Trash2, Wand2, X, Copy, Download, AlertCircle, CheckCircle,
  Check
} from 'lucide-react';
import jsyaml from 'js-yaml';
import { JsonEditor } from 'json-edit-react'

const App = () => {
  const [inputFormat, setInputFormat] = useState('json');
  const [outputFormat, setOutputFormat] = useState('yaml');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('Converted data will appear here...');
  const [parsedData, setParsedData] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Analytics states
  const [inputStats, setInputStats] = useState({ lines: 0, chars: 0, words: 0, size: '0 B' });
  const [outputStats, setOutputStats] = useState({ lines: 0, chars: 0, words: 0, size: '0 B' });
  const [comparisonStats, setComparisonStats] = useState({
    compression: '0%',
    sizeDiff: '0 B',
    lineDiff: '0',
    charDiff: '0'
  });

  // Update analytics for text
  const updateAnalytics = useCallback((text) => {
    const lines = text ? text.split('\n').length : 0;
    const chars = text.length;
    const words = text ? text.trim().split(/\s+/).filter(w => w).length : 0;
    const size = new Blob([text]).size;
    
    return {
      lines,
      chars: chars.toLocaleString(),
      words: words.toLocaleString(),
      size: formatBytes(size)
    };
  }, []);

  // Format bytes
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Parse input based on format
  const parseInput = useCallback((input, format) => {
    switch(format) {
      case 'json':
        return JSON.parse(input);
      
      case 'yaml':
        return jsyaml.load(input);
      
      case 'xml':
        return parseXML(input);
      
      case 'csv':
        return parseCSV(input);
      
      case 'toon':
        return parseTOML(input);
      
      default:
        throw new Error('Unsupported input format');
    }
  }, []);

  // Format output based on format
  const formatOutput = useCallback((data, format) => {
    switch(format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      
      case 'yaml':
        return jsyaml.dump(data, { indent: 2, lineWidth: -1 });
      
      case 'xml':
        return toXML(data);
      
      case 'csv':
        return toCSV(data);
      
      case 'toon':
        return toTOML(data);
      
      default:
        throw new Error('Unsupported output format');
    }
  }, []);

  // XML parser
  const parseXML = (xmlString) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('Invalid XML format');
    }
    
    const xmlToJson = (xml) => {
      let obj = {};
      
      if (xml.nodeType === 1) {
        if (xml.attributes.length > 0) {
          obj['@attributes'] = {};
          for (let j = 0; j < xml.attributes.length; j++) {
            const attribute = xml.attributes.item(j);
            obj['@attributes'][attribute.nodeName] = attribute.nodeValue;
          }
        }
      } else if (xml.nodeType === 3) {
        return xml.nodeValue.trim();
      }
      
      if (xml.hasChildNodes()) {
        for (let i = 0; i < xml.childNodes.length; i++) {
          const item = xml.childNodes.item(i);
          const nodeName = item.nodeName;
          
          if (typeof obj[nodeName] === 'undefined') {
            const tmp = xmlToJson(item);
            if (tmp !== '') obj[nodeName] = tmp;
          } else {
            if (typeof obj[nodeName].push === 'undefined') {
              const old = obj[nodeName];
              obj[nodeName] = [];
              obj[nodeName].push(old);
            }
            const tmp = xmlToJson(item);
            if (tmp !== '') obj[nodeName].push(tmp);
          }
        }
      }
      
      return obj;
    };
    
    return xmlToJson(xmlDoc.documentElement);
  };

  // Convert to XML
  const toXML = (obj, rootName = 'root', indent = 0) => {
    const indentStr = '  '.repeat(indent);
    let xml = '';
    
    if (indent === 0) {
      xml += '<?xml version="1.0" encoding="UTF-8"?>\n';
    }
    
    if (Array.isArray(obj)) {
      obj.forEach(item => {
        xml += toXML(item, 'item', indent);
      });
    } else if (typeof obj === 'object' && obj !== null) {
      xml += `${indentStr}<${rootName}>\n`;
      
      for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
          value.forEach(item => {
            xml += toXML(item, key, indent + 1);
          });
        } else if (typeof value === 'object' && value !== null) {
          xml += toXML(value, key, indent + 1);
        } else {
          xml += `${indentStr}  <${key}>${value}</${key}>\n`;
        }
      }
      
      xml += `${indentStr}</${rootName}>\n`;
    } else {
      xml += `${indentStr}<${rootName}>${obj}</${rootName}>\n`;
    }
    
    return xml;
  };

  // Parse CSV
  const parseCSV = (csv) => {
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
      const obj = {};
      const currentLine = lines[i].split(',');
      
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = currentLine[j] ? currentLine[j].trim() : '';
      }
      
      result.push(obj);
    }
    
    return result;
  };

  // Convert to CSV
  const toCSV = (data) => {
  if (!Array.isArray(data)) {
    // If it's a single object, convert to array
    data = [data];
  }
  
  if (data.length === 0) return '';
  
  // Get all unique headers from all objects (handle nested structures)
  const headers = getAllHeaders(data);
  let csv = headers.join(',') + '\n';
  
  data.forEach(row => {
    const values = headers.map(header => {
      // Handle nested keys like 'user.name' or 'address.city'
      const value = getNestedValue(row, header);
      
      // Convert value to string and handle special cases
      let stringValue;
      if (value === null || value === undefined) {
        stringValue = '';
      } else if (typeof value === 'object') {
        // Convert objects and arrays to JSON string
        stringValue = JSON.stringify(value);
      } else {
        stringValue = String(value);
      }
      
      // Quote values that contain commas, quotes, or newlines
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        stringValue = `"${stringValue.replace(/"/g, '""')}"`;
      }
      
      return stringValue;
    });
    csv += values.join(',') + '\n';
  });
  
  return csv;
};

// Helper function to get all headers including nested ones
const getAllHeaders = (data) => {
  const headers = new Set();
  
  data.forEach(row => {
    const extractHeaders = (obj, prefix = '') => {
      Object.keys(obj).forEach(key => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Recursively get headers from nested objects
          extractHeaders(value, fullKey);
        } else {
          headers.add(fullKey);
        }
      });
    };
    
    extractHeaders(row);
  });
  
  return Array.from(headers);
};

// Helper function to get nested values using dot notation
const getNestedValue = (obj, path) => {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : '';
  }, obj);
};

  // Simple TOML parser
  const parseTOML = (toon) => {
    const lines = toon.trim().split('\n');
    const result = {};
    let currentSection = result;
    
    lines.forEach(line => {
      line = line.trim();
      
      if (line.startsWith('[') && line.endsWith(']')) {
        const section = line.slice(1, -1);
        currentSection = result[section] = {};
      } else if (line.includes('=')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim();
        currentSection[key.trim()] = parseValue(value);
      }
    });
    
    return result;
  };

  const parseValue = (value) => {
    value = value.replace(/^["']|["']$/g, '');
    
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(value) && value !== '') return Number(value);
    
    return value;
  };

  // Convert to TOML
  const toTOML = (obj, section = '') => {
  let toon = '';
  
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      // Handle arrays with custom format
      if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
        // Array of objects - get all property names from first object
        const propertyNames = Object.keys(value[0]);
        const propertyList = propertyNames.join(',');
        
        toon += `${section ? `${section}.` : ''}${key}[${value.length}]{${propertyList}}:\n`;
        
        // Add each object's values
        value.forEach((item, index) => {
          const values = propertyNames.map(prop => {
            const val = item[prop];
            return typeof val === 'string' ? `"${val}"` : val;
          });
          toon += `  ${values.join(',')}\n`;
        });
      } else {
        // Array of primitives
        toon += `${section ? `${section}.` : ''}${key}[${value.length}]:\n`;
        value.forEach((item, index) => {
          const formattedValue = typeof item === 'string' ? `"${item}"` : item;
          toon += `  ${formattedValue}\n`;
        });
      }
    } else if (typeof value === 'object' && value !== null) {
      // Handle nested objects with colon syntax
      const newSection = section ? `${section}.${key}` : key;
      toon += `\n${newSection}:\n`;
      toon += toTOML(value, newSection).replace(/^/gm, '  ');
    } else {
      // Handle primitive values with colon syntax
      const formattedValue = typeof value === 'string' ? `"${value}"` : value;
      toon += `  ${key}: ${formattedValue}\n`;
    }
  }
  
  return toon;
};

  // Handle input changes
  const handleInput = useCallback(() => {
    setError(null);
    setSuccess(null);

    if (!inputText.trim()) {
      setOutputText('Converted data will appear here...');
      setOutputStats(updateAnalytics(''));
      setComparisonStats({
        compression: '0%',
        sizeDiff: '0 B',
        lineDiff: '0',
        charDiff: '0'
      });
      return;
    }

    try {
      const parsed = parseInput(inputText, inputFormat);
      setParsedData(parsed);
      
      const output = formatOutput(parsed, outputFormat);
      setOutputText(output);
      
      setOutputStats(updateAnalytics(output));
      
      // Update comparison stats
      const inputSize = new Blob([inputText]).size;
      const outputSize = new Blob([output]).size;
      const sizeDiff = outputSize - inputSize;
      const compression = inputSize > 0 ? ((1 - outputSize / inputSize) * 100).toFixed(1) : 0;
      
      const inputLines = inputText.split('\n').length;
      const outputLines = output.split('\n').length;
      const lineDiff = outputLines - inputLines;
      const charDiff = output.length - inputText.length;
      
      setComparisonStats({
        compression: compression + '%',
        sizeDiff: (sizeDiff >= 0 ? '+' : '') + formatBytes(Math.abs(sizeDiff)),
        lineDiff: (lineDiff >= 0 ? '+' : '') + lineDiff,
        charDiff: (charDiff >= 0 ? '+' : '') + charDiff.toLocaleString()
      });
      
      setSuccess(`Successfully converted from ${inputFormat.toUpperCase()} to ${outputFormat.toUpperCase()}`);
      
    } catch (err) {
      setError(err.message);
      setOutputText('Error in conversion. Please check your input.');
    }
  }, [inputText, inputFormat, outputFormat, parseInput, formatOutput, updateAnalytics]);

  // Format input
  const formatInput = () => {
    if (!inputText.trim()) return;
    
    try {
      const parsed = parseInput(inputText, inputFormat);
      const formatted = formatOutput(parsed, inputFormat);
      setInputText(formatted);
    } catch (err) {
      setError('Cannot format: ' + err.message);
    }
  };

  // Clear input
  const clearInput = () => {
    setInputText('');
    setError(null);
    setSuccess(null);
  };

  // Clear all
  const clearAll = () => {
    setInputText('');
    setOutputText('Converted data will appear here...');
    setError(null);
    setSuccess(null);
    setInputStats(updateAnalytics(''));
    setOutputStats(updateAnalytics(''));
  };

  // Copy output
  const copyOutput = async () => {
    if (outputText && !outputText.includes('appear here')) {
      try {
        await navigator.clipboard.writeText(outputText);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    }
  };

  // Download output
  const downloadOutput = () => {
    if (outputText && !outputText.includes('appear here')) {
      const blob = new Blob([outputText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `converted.${outputFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Load examples
  const loadExample = (type) => {
    let example = '';
    
    switch(type) {
      case 'simple':
        example = JSON.stringify({
          name: "John Doe",
          age: 30,
          email: "john@example.com",
          active: true
        }, null, 2);
        break;
      
      case 'nested':
        example = JSON.stringify({
          user: {
            name: "Jane Smith",
            contact: {
              email: "jane@example.com",
              phone: "+1234567890"
            },
            address: {
              street: "123 Main St",
              city: "New York",
              country: "USA"
            }
          }
        }, null, 2);
        break;
      
      case 'array':
        example = JSON.stringify({
          users: [
            { id: 1, name: "Alice", role: "Admin" },
            { id: 2, name: "Bob", role: "User" },
            { id: 3, name: "Charlie", role: "Moderator" }
          ]
        }, null, 2);
        break;
      
      case 'mixed':
        example = JSON.stringify({
          title: "Project Alpha",
          version: 1.5,
          active: true,
          tags: ["development", "production"],
          metadata: {
            created: "2024-01-01",
            updated: "2024-01-15"
          },
          contributors: [
            { name: "Dev1", commits: 150 },
            { name: "Dev2", commits: 89 }
          ]
        }, null, 2);
        break;
    }
    
    setInputFormat('json');
    setInputText(example);
  };

  // Update input stats when inputText changes
  useEffect(() => {
    setInputStats(updateAnalytics(inputText));
  }, [inputText, updateAnalytics]);

  // Handle conversion when dependencies change
  useEffect(() => {
    handleInput();
  }, [handleInput]);

  const FormatButton = ({ format, currentFormat, setFormat, type }) => (
    <button
      onClick={() => setFormat(format)}
      className={`format-btn px-3 py-1.5 text-xs font-medium border border-zinc-200 rounded-lg hover:border-zinc-300 transition-all ${
        currentFormat === format ? 'active bg-zinc-900 text-white' : ''
      }`}
    >
      {format.toUpperCase()}
    </button>
  );

  return (
    <div className="bg-white text-zinc-950 antialiased min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Data Converter</h1>
              <p className="text-sm text-zinc-600 mt-1">Convert between JSON, YAML, XML, CSV instantly</p>
            </div>
            <div className="hidden sm:flex items-center gap-3">
              <button 
                onClick={clearAll}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:text-zinc-950 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        
        {/* Format Selectors */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
          
          {/* Input Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-700">Input Format</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={formatInput}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 rounded-md transition-colors"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  Format
                </button>
                <button 
                  onClick={clearInput}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear
                </button>
              </div>
            </div>
            
            <div className="flex gap-2 flex-wrap">
              {['json', 'yaml', 'xml', 'csv', 'toon'].map(format => (
                <FormatButton
                  key={format}
                  format={format}
                  currentFormat={inputFormat}
                  setFormat={setInputFormat}
                  type="input"
                />
              ))}
            </div>
          </div>

          {/* Output Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-700">Output Format</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={copyOutput}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 rounded-md transition-colors"
                >
                  {copySuccess ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy
                </button>
                <button 
                  onClick={downloadOutput}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 rounded-md transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
              </div>
            </div>
            
            <div className="flex gap-2 flex-wrap">
              {['toon','json', 'yaml', 'xml', 'csv'].map(format => (
                <FormatButton
                  key={format}
                  format={format}
                  currentFormat={outputFormat}
                  setFormat={setOutputFormat}
                  type="output"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Editor Area */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          
          {/* Input Editor */}
          <div className="space-y-3">
            <div className="relative border border-zinc-200 rounded-lg overflow-hidden bg-zinc-50">
              <textarea 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="w-full text-blue-500 font-semibold h-96 p-4 bg-transparent text-sm resize-none focus:outline-none relative z-10 font-mono"
                placeholder="Paste or type your data here..."
                spellCheck="false"
              />
            </div>
            
            {/* Input Analytics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                <div className="text-xs text-zinc-600">Lines</div>
                <div className="text-lg font-semibold tracking-tight mt-0.5">{inputStats.lines}</div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                <div className="text-xs text-zinc-600">Characters</div>
                <div className="text-lg font-semibold tracking-tight mt-0.5">{inputStats.chars}</div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                <div className="text-xs text-zinc-600">Words</div>
                <div className="text-lg font-semibold tracking-tight mt-0.5">{inputStats.words}</div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                <div className="text-xs text-zinc-600">Size</div>
                <div className="text-lg font-semibold tracking-tight mt-0.5">{inputStats.size}</div>
              </div>
            </div>
            
            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-medium text-red-900">Validation Error</div>
                    <div className="text-xs text-red-700 mt-1">{error}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Output Editor */}
          <div className="space-y-3">
            <div className="relative border border-zinc-200 rounded-lg overflow-hidden bg-zinc-50">
              <pre className="w-full h-96 p-4 text-sm overflow-auto font-mono">
                <code className={outputText.includes('Error') ? 'text-red-600' : outputText.includes('appear here') ? 'text-zinc-400' : ''}>
                  {outputText}
                </code>
              </pre>
            </div>
            
            {/* Output Analytics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                <div className="text-xs text-zinc-600">Lines</div>
                <div className="text-lg font-semibold tracking-tight mt-0.5">{outputStats.lines}</div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                <div className="text-xs text-zinc-600">Characters</div>
                <div className="text-lg font-semibold tracking-tight mt-0.5">{outputStats.chars}</div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                <div className="text-xs text-zinc-600">Words</div>
                <div className="text-lg font-semibold tracking-tight mt-0.5">{outputStats.words}</div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                <div className="text-xs text-zinc-600">Size</div>
                <div className="text-lg font-semibold tracking-tight mt-0.5">{outputStats.size}</div>
              </div>
            </div>
            
            {/* Success Display */}
            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-medium text-green-900">Conversion Successful</div>
                    <div className="text-xs text-green-700 mt-1">{success}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

       

        {/* Quick Examples */}
        <div className="mt-6 sm:mt-8">
          <h3 className="text-sm font-medium text-zinc-900 mb-3">Quick Examples</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button 
              onClick={() => loadExample('simple')}
              className="text-left p-3 border border-zinc-200 rounded-lg hover:border-zinc-300 hover:bg-zinc-50 transition-all"
            >
              <div className="text-xs font-medium text-zinc-900">Simple Object</div>
              <div className="text-xs text-zinc-600 mt-1">Basic key-value pairs</div>
            </button>
            <button 
              onClick={() => loadExample('nested')}
              className="text-left p-3 border border-zinc-200 rounded-lg hover:border-zinc-300 hover:bg-zinc-50 transition-all"
            >
              <div className="text-xs font-medium text-zinc-900">Nested Data</div>
              <div className="text-xs text-zinc-600 mt-1">Complex nested structure</div>
            </button>
            <button 
              onClick={() => loadExample('array')}
              className="text-left p-3 border border-zinc-200 rounded-lg hover:border-zinc-300 hover:bg-zinc-50 transition-all"
            >
              <div className="text-xs font-medium text-zinc-900">Array Data</div>
              <div className="text-xs text-zinc-600 mt-1">List of items</div>
            </button>
            <button 
              onClick={() => loadExample('mixed')}
              className="text-left p-3 border border-zinc-200 rounded-lg hover:border-zinc-300 hover:bg-zinc-50 transition-all"
            >
              <div className="text-xs font-medium text-zinc-900">Mixed Types</div>
              <div className="text-xs text-zinc-600 mt-1">Various data types</div>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 mt-12 sm:mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-zinc-600">
              Smart Data Format Converter • Real-time conversion
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-600">
              <span>Supports JSON, YAML, XML, CSV, TOON</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;