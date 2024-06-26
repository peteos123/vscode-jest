/**
 * this module contains functions to show jest test results in
 * vscode inspector via the DiagnosticsCollection.
 */
import * as vscode from 'vscode';
import { existsSync } from 'fs';
import { TestFileAssertionStatus } from 'jest-editor-support';
import { TestStatus, TestResult } from './TestResults';
import { testIdString } from './helpers';

function createDiagnosticWithRange(
  message: string,
  range: vscode.Range,
  testName?: string
): vscode.Diagnostic {
  const msg = testName ? `${testName}\n-----\n${message}` : message;
  const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Error);
  diag.source = 'Jest';
  return diag;
}

function createDiagnostic(
  message: string,
  lineNumber: number,
  name?: string,
  startCol = 0,
  endCol = Number.MAX_SAFE_INTEGER
): vscode.Diagnostic {
  const line = lineNumber > 0 ? lineNumber - 1 : 0;
  return createDiagnosticWithRange(message, new vscode.Range(line, startCol, line, endCol), name);
}

// update diagnostics for the active editor
// it will utilize the parsed test result to mark actual text position.
export function updateCurrentDiagnostics(
  testResults: TestResult[],
  collection: vscode.DiagnosticCollection,
  editor: vscode.TextEditor
): void {
  const uri = editor.document.uri;

  if (!testResults.length) {
    collection.delete(uri);
    return;
  }
  const allDiagnostics = testResults.reduce((list, tr) => {
    const allResults = tr.multiResults ? [tr, ...tr.multiResults] : [tr];
    const diagnostics = allResults
      .filter((r) => r.status === TestStatus.KnownFail)
      .map((r) => {
        const line = r.lineNumberOfError || r.end.line;
        const textLine = editor.document.lineAt(line);
        const name = testIdString('display', r.identifier);
        return createDiagnosticWithRange(
          r.shortMessage || r.terseMessage || 'unknown error',
          textLine.range,
          name
        );
      });
    list.push(...diagnostics);
    return list;
  }, [] as vscode.Diagnostic[]);

  collection.set(uri, allDiagnostics);
}

// update all diagnosis with jest test results
// note, this method aim to quickly lay down the diagnosis baseline.
// For performance reason, we will not parse individual file here, therefore
// will not have the actual info about text position. However when the file
// become active, it will then utilize the actual file content via updateCurrentDiagnostics()

export function updateDiagnostics(
  testResults: TestFileAssertionStatus[],
  collection: vscode.DiagnosticCollection
): void {
  function addTestFileError(result: TestFileAssertionStatus, uri: vscode.Uri): void {
    const diag = createDiagnostic(result.message || 'test file error', 0, undefined, 0, 0);
    collection.set(uri, [diag]);
  }

  function addTestsError(result: TestFileAssertionStatus, uri: vscode.Uri): void {
    if (!result.assertions) {
      return;
    }
    const asserts = result.assertions.filter((a) => a.status === TestStatus.KnownFail);
    collection.set(
      uri,
      asserts.map((assertion) => {
        const name = testIdString('display', assertion);
        return createDiagnostic(
          assertion.shortMessage || assertion.message,
          assertion.line ?? -1,
          name
        );
      })
    );
  }

  testResults.forEach((result) => {
    const uri = vscode.Uri.file(result.file);
    switch (result.status) {
      case TestStatus.KnownFail:
        if (result.assertions && result.assertions.length <= 0) {
          addTestFileError(result, uri);
        } else {
          addTestsError(result, uri);
        }
        break;
      default:
        collection.delete(uri);
        break;
    }
  });

  // Remove diagnostics for files no longer in existence
  const toBeDeleted: vscode.Uri[] = [];
  collection.forEach((uri) => {
    if (!existsSync(uri.fsPath)) {
      toBeDeleted.push(uri);
    }
  });
  toBeDeleted.forEach((uri) => {
    collection.delete(uri);
  });
}

export function resetDiagnostics(diagnostics: vscode.DiagnosticCollection): void {
  diagnostics.clear();
}
export function failedSuiteCount(diagnostics: vscode.DiagnosticCollection): number {
  let sum = 0;
  diagnostics.forEach(() => sum++);
  return sum;
}
