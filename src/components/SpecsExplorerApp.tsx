import React, { useState } from 'react';
import { BookOpen, Search, Download, Copy, Check, ChevronRight } from 'lucide-react';
import { JARVISOS_SPECS } from '../data/specs-data';
import { sound } from '../utils/audio-fx';

export const SpecsExplorerApp: React.FC = () => {
  const [selectedPartNum, setSelectedPartNum] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const selectedPart =
    JARVISOS_SPECS.find(p => p.partNumber === selectedPartNum) || JARVISOS_SPECS[0];

  // Filter sections if search query is active
  const filteredSections = selectedPart.sections.filter(sec => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      sec.heading.toLowerCase().includes(q) ||
      sec.content.toLowerCase().includes(q) ||
      (sec.codeSnippet && sec.codeSnippet.code.toLowerCase().includes(q))
    );
  });

  const copyCode = (code: string, id: string) => {
    sound.playBlip();
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const exportFullWhitepaper = () => {
    sound.playConfirm();
    let doc = `# PROJECT JARVISOS: MASTER ENGINEERING SPECIFICATIONS (PARTS 1-12)\n\n`;
    JARVISOS_SPECS.forEach(part => {
      doc += `\n================================================================================\n`;
      doc += `${part.title}\n${part.subtitle}\n`;
      doc += `================================================================================\n\n`;
      part.sections.forEach(sec => {
        doc += `### ${sec.heading}\n\n${sec.content}\n\n`;
        if (sec.diagram) {
          doc += `\`\`\`text\n${sec.diagram}\n\`\`\`\n\n`;
        }
        if (sec.codeSnippet) {
          doc += `\`\`\`${sec.codeSnippet.language}\n${sec.codeSnippet.code}\n\`\`\`\n\n`;
        }
      });
    });

    const blob = new Blob([doc], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'JARVISOS-Master-Engineering-Specification-Parts-1-12.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const [showMobileList, setShowMobileList] = useState(false);

  return (
    <div className="flex flex-col sm:flex-row h-full bg-slate-950/95 text-slate-200 font-sans text-xs overflow-hidden">
      {/* Mobile Top Part Bar */}
      <div className="sm:hidden flex items-center justify-between p-2.5 border-b border-cyan-500/20 bg-slate-900 shrink-0">
        <button
          onClick={() => setShowMobileList(!showMobileList)}
          className="px-2.5 py-1 bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-mono text-[11px] rounded"
        >
          {showMobileList ? 'Close Parts Menu' : `P${selectedPart.partNumber}: Select Part (${selectedPart.partNumber}/12)`}
        </button>
        <button
          onClick={exportFullWhitepaper}
          className="p-1.5 text-cyan-400 hover:text-cyan-300"
          title="Download Full Whitepaper"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Parts Navigation Sidebar */}
      <div
        className={`${
          showMobileList ? 'flex' : 'hidden'
        } sm:flex w-full sm:w-64 border-r border-cyan-500/20 bg-slate-900/90 sm:bg-slate-900/70 flex-col shrink-0 z-30 sm:relative absolute inset-0 sm:inset-auto top-10 sm:top-0`}
      >
        <div className="p-3 border-b border-cyan-500/20 hidden sm:flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-cyan-400" />
            <span className="font-bold tracking-wider text-cyan-300 font-mono text-[11px]">
              ENGINEERING SPECS
            </span>
          </div>
          <button
            onClick={exportFullWhitepaper}
            title="Download Full 12-Part Master Whitepaper"
            className="p-1.5 hover:bg-slate-800 rounded text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-2 border-b border-slate-800">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search specs (CSpace, NovaFS, EAS)..."
              className="w-full bg-slate-950 border border-slate-800 rounded pl-7 pr-2.5 py-1.5 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {/* Parts List */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-1 font-mono text-[11px]">
          {JARVISOS_SPECS.map(part => (
            <button
              key={part.partNumber}
              onClick={() => {
                sound.playBlip();
                setSelectedPartNum(part.partNumber);
                setShowMobileList(false);
              }}
              className={`w-full text-left p-2 rounded transition-all flex items-start gap-1.5 ${
                selectedPartNum === part.partNumber
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <span className="text-cyan-400 shrink-0 font-bold">P{part.partNumber}:</span>
              <span className="truncate">{part.title.split(':')[1]?.trim() || part.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Spec Content Reader */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        {/* Part Title Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 shrink-0">
          <div className="text-xs font-mono text-cyan-400 font-bold tracking-wider">
            JARVISOS SPECIFICATION {selectedPart.partNumber} OF {selectedPart.totalParts}
          </div>
          <h1 className="text-base font-bold text-slate-100 mt-1">{selectedPart.title}</h1>
          <div className="text-xs text-slate-400 mt-0.5">{selectedPart.subtitle}</div>
        </div>

        {/* Sections Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {filteredSections.map(sec => (
            <div key={sec.id} className="space-y-3 pb-6 border-b border-slate-800/80">
              <h2 className="text-sm font-bold text-cyan-300 font-mono tracking-wide flex items-center gap-1.5">
                <ChevronRight className="w-3.5 h-3.5 text-cyan-400" />
                <span>{sec.heading}</span>
              </h2>

              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line font-sans">
                {sec.content}
              </p>

              {/* ASCII Diagram if present */}
              {sec.diagram && (
                <div className="p-3 bg-slate-950 rounded-lg border border-cyan-500/30 font-mono text-[11px] text-cyan-400 overflow-x-auto leading-tight">
                  <pre>{sec.diagram}</pre>
                </div>
              )}

              {/* Parameter Table if present */}
              {sec.table && (
                <div className="overflow-x-auto rounded border border-slate-800">
                  <table className="w-full text-left font-mono text-[11px]">
                    <thead className="bg-slate-900 text-cyan-300 border-b border-slate-800">
                      <tr>
                        {sec.table.headers.map((h, i) => (
                          <th key={i} className="p-2 font-bold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                      {sec.table.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-900/40">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="p-2 text-slate-300">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Code Snippet if present */}
              {sec.codeSnippet && (
                <div className="relative rounded-lg border border-slate-800 bg-slate-950 overflow-hidden font-mono text-[11px]">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-slate-400 text-[10px]">
                    <span>{sec.codeSnippet.language.toUpperCase()} ARCHITECTURE PRIMITIVE</span>
                    <button
                      onClick={() => copyCode(sec.codeSnippet!.code, sec.id)}
                      className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
                    >
                      {copiedCodeId === sec.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-3 text-cyan-200 overflow-x-auto leading-relaxed">
                    <code>{sec.codeSnippet.code}</code>
                  </pre>
                </div>
              )}
            </div>
          ))}

          {filteredSections.length === 0 && (
            <div className="text-center py-12 text-slate-500 font-mono text-xs">
              No sections matching "{searchQuery}" in this specification part.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
