import fs from 'fs';
import marked from 'marked';
import escape from 'escape-html';

/* --- Symbols for Private Members --- */

/**
 * Private Values
 */
const OPTIONS = Symbol('Options');
const FILE_NAME = Symbol('Filename');
const CSS_STYLES = '<style> h1 { text-align: center; } ol > li { padding-bottom: 15px; font-weight: 500 } ul > li { font-weight: 400; font-size: 12px; } ol > li > span { font-weight: 400; } thead th { text-align: center; } tr { border: 1px solid lightsalmon; } tbody th, tbody td { padding: 5px; text-align: left; vertical-align: text-top; font-weight: normal; } table.summary-table { width: 100%; }</style>';

/**
 * Private Methods
 */
const INIT_HTML = Symbol('Prepare HTML File');
const WRITE_TO_FILE = Symbol('Append an html string to the report file');

export default class HTMLReporter {
  constructor(opts) {
    this[OPTIONS] = Object.assign({}, opts);
    this[INIT_HTML] = initHTML.bind(this);
  }

  async open(filename = 'report.html') {
    fs.writeFileSync(filename, '');
    this[FILE_NAME] = fs.openSync(filename, 'w');
    this[WRITE_TO_FILE] = string => fs.writeSync(this[FILE_NAME], string);
  }

  async write(views) {
    await initHTML.call(this);
    await writeSummaryTable.call(this, views);
    await writeCompleteResults.call(this, views);
  }

  async close() {
    closeHTML.call(this);
  }
}


function initHTML() {
  const writeToFile = this[WRITE_TO_FILE];

  const titleString = `aXe Accessibility Engine Report for ${this[OPTIONS].domain}  \n${new Date().toString()}`;

  writeToFile(`<!doctype html> <html lang="en"><head><title>${titleString}</title><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/2.8.0/github-markdown.css"><link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css">${CSS_STYLES}</head><body><div class="container"><div class="row"><div class="col-xs-12">${marked(`# ${titleString}`)}`);
  writeToFile(marked('This report is not a complete accessibility audit.  This report only documents those accessibility features tested by the axe-core library, and should not be considered exhaustive of the possible accessibility issues a website may have.  Use this report as a tool in a complete and comprehensive process of reviewing this site for accessibility issues.  More information regarding the features tested by the axe-core library may be found at [axe-core.org](https://axe-core.org/)'));

  if (this[OPTIONS].random !== 1) {
    writeToFile(marked(`This report represents only a random sample of ${Math.round(this[OPTIONS].random * 100)}% of all webpages on this domain.`));
  }
}

function testResultList(reports, type) {
  const resultList = new Set();
  reports[type].forEach(({ viewPort, report }) => {
    const reportObject = JSON.parse(report);
    reportObject.forEach(({ description }) => {
      resultList.add(`* ${escape(description)}\n`);
    });
  });

  return resultList.size > 0 ? marked([...resultList].reduce((list, item) => list + item, '')) : `No ${type} detected by axe-core`;
}

async function writeSummaryTable(testedURLs) {
  const writeToFile = this[WRITE_TO_FILE];

  writeToFile(marked('## Summary of Overall Test Results'));
  writeToFile('<table class="summary-table"><thead><tr><th scope="col">URL</th><th scope="col">Failing Tests</th><th scope="col">Passing Tests</th></tr></thead><tbody>');

  await Promise.all(testedURLs.map(async ({ url }) => {
    const reports = await this[OPTIONS].db.read('summary', { url });
    await writeToFile(`<tr><th scope="row">${url}</th>`);
    await writeToFile(`<td>${testResultList(reports, 'violations')}</td>`);
    await writeToFile(`<td>${testResultList(reports, 'passes')}</td></tr>`);
  }));

  writeToFile('</tbody></table>');
}

function closeHTML() {
  const writeToFile = this[WRITE_TO_FILE];

  writeToFile('</body><script></script></html>');

  fs.closeSync(this[FILE_NAME]);
}

function countResults(violations) {
  return violations.reduce((sum, { viewPort, url, report }) => {
    const result = JSON.parse(report);
    return sum + result.length;
  }, 0);
}

function writeNodeMessages(list, {
  html, any, all, none,
}) {
  /* eslint-disable no-param-reassign */
  list += `<li>${escape(html)}`;
  any.forEach(({ message }) => {
    list += `<br />${escape(message)}`;
  });
  all.forEach(({ message }) => {
    list += `<br />${escape(message)}`;
  });
  none.forEach(({ message }) => {
    list += `<br />${escape(message)}`;
  });
  list += '</li>';
  return list;
  /* eslint-enable no-param-reassign */
}

async function writeCompleteResults(testedURLs) {
  const writeToFile = this[WRITE_TO_FILE];
  writeToFile('<div class="row"><div class="col-xs-12">');
  writeToFile(`${marked('## Detailed List of Failing Tests')}</div></div>`);

  await Promise.all(testedURLs.map(async ({ url }) => {
    const violations = await this[OPTIONS].db.read('violations_summary', { url });
    const violationCount = countResults(violations);
    writeToFile(marked(`### ${escape(url)} ${violationCount} violations`));
    writeToFile('<br/>');
    await Promise.all(violations.map(({ viewPort, url, report }) => {
      const results = JSON.parse(report);
      if (results.length > 0) {
        writeToFile(`<h4>${viewPort.toUpperCase()}</h4><br/><ol>${results.reduce((item, {
          description,
          nodes,
          impact,
        }) => {
          item += `<li>${impact ? `${impact.toUpperCase()}: ` : ''}${escape(description)}<br />`;
          item += '<span>Affected Nodes: </span><ul>';
          item += nodes.reduce(writeNodeMessages, '');
          item += '</ul></li>';
          return item;
        }, '')}`);
      }
    }));
  }));

  writeToFile(marked('## Detailed List of Passing Tests'));
  await Promise.all(testedURLs.map(async ({ url }) => {
    const passes = await this[OPTIONS].db.read('passes_summary', { url });
    const passCount = countResults(passes);
    writeToFile(marked(`### ${escape(url)} ${passCount} passing tests`));
    writeToFile('<br/>');
    await Promise.all(passes.map(({ viewPort, url, report }) => {
      const results = JSON.parse(report);
      if (results.length > 0) {
        writeToFile(`<h4>${viewPort.toUpperCase()}</h4><br/><ol>${results.reduce((item, {
          description,
          nodes,
          impact,
        }) => {
          item += `<li>${impact ? `${impact.toUpperCase()}: ` : ''}${escape(description)}<br />`;
          item += '<span>Affected Nodes: </span><ul>';
          item += nodes.reduce(writeNodeMessages, '');
          item += '</ul></li>';
          return item;
        }, '')}`);
      }
    }));
  }));
}