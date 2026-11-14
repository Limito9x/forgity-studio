import { appConfig } from "@/config/appConfig";

export interface ScriptSecurityFlag {
  id: string;
  label: string;
  description: string;
  severity: "warning" | "danger";
}

export interface AuditableScript {
  fileName: string;
  executor?: string;
  scriptContent?: string | null;
}

/**
 * Heuristically inspects Python script content for sensitive/risky calls.
 */
export function scanScriptSecurityFlags(code: string | null | undefined): ScriptSecurityFlag[] {
  if (!code || typeof code !== "string") return [];

  const flags: ScriptSecurityFlag[] = [];

  // 1. Network & Socket connections
  if (/(?:import\s+(?:socket|requests|urllib|http\.client|ftplib)|from\s+(?:socket|requests|urllib)\s+import)/i.test(code)) {
    flags.push({
      id: "network",
      label: "Network / Sockets",
      description: "Uses external network libraries (requests, urllib, socket) which can exfiltrate data.",
      severity: "warning",
    });
  }

  // 2. Subprocess & Shell execution
  if (/(?:subprocess\.(?:Popen|run|call|check_output)|os\.system|os\.popen|os\.spawn)/i.test(code)) {
    flags.push({
      id: "subprocess",
      label: "Subprocess Execution",
      description: "Spawns external operating system shell or subprocesses.",
      severity: "danger",
    });
  }

  // 3. Destructive File deletion
  if (/(?:shutil\.rmtree|os\.remove|os\.unlink|os\.rmdir)/i.test(code)) {
    flags.push({
      id: "destructive-fs",
      label: "File Deletion",
      description: "Contains file or directory removal calls (shutil.rmtree, os.remove).",
      severity: "warning",
    });
  }

  // 4. Dynamic Code Evaluation & Obfuscation
  if (/(?:\beval\s*\(|\bexec\s*\(|base64\.b64decode|__import__\s*\(|ctypes\b)/i.test(code)) {
    flags.push({
      id: "dynamic-exec",
      label: "Dynamic Eval / Obfuscation",
      description: "Uses eval/exec or base64 decoding which may obscure executed commands.",
      severity: "danger",
    });
  }

  return flags;
}

/**
 * Generates a unified Markdown prompt containing all scripts in a pipeline package,
 * structured for an instant 1-click comprehensive security audit by an AI model.
 */
export function generatePipelineSecurityAuditPrompt(
  scripts: AuditableScript[],
  packageName?: string
): string {
  const validScripts = scripts.filter((s) => Boolean(s.scriptContent?.trim()));
  const scriptCount = validScripts.length;

  const header = [
    `# ${appConfig.name.toUpperCase()} - PIPELINE SCRIPTS SECURITY AUDIT REQUEST`,
    ``,
    `You are a Senior Pipeline Security Engineer and Technical Director.`,
    `A creator is about to import a pipeline package ("${packageName || "pipeline-bundle"}") into ${appConfig.name}.`,
    `This pipeline contains ${scriptCount} Python script(s) that will be executed inside local Digital Content Creation (DCC) environments (such as Blender, Unreal Engine, or headless Python runners).`,
    ``,
    `## INSTRUCTIONS FOR SECURITY AUDITING:`,
    `1. Carefully inspect each bundled script below for security risks or malicious behaviors:`,
    `   - **Network Leaks / Reverse Shells**: Unauthorized socket communication, HTTP POST/GET exfiltration (\`socket\`, \`requests\`, \`urllib\`).`,
    `   - **Destructive File Operations**: Deleting files or clearing directories outside standard output folders (\`shutil.rmtree\`, \`os.remove\`).`,
    `   - **Arbitrary OS Command Execution**: Unsafe system shell executions (\`os.system\`, \`subprocess.Popen\` with shell=True, \`exec\`, \`eval\`).`,
    `   - **Obfuscated Payloads**: Base64 decoding, packed hex buffers, ctypes kernel tampering.`,
    `2. For each script, provide:`,
    `   - **Verdict**: [✅ SAFE | ⚠️ CAUTION | 🚨 DANGEROUS]`,
    `   - **Purpose**: Brief summary (1-2 sentences) of what the script actually does.`,
    `   - **Identified Flags**: Any sensitive functions or external calls found.`,
    `3. Conclude with an **Overall Pipeline Trust Verdict**:`,
    `   - **RECOMMENDATION**: [APPROVE TO IMPORT & RUN / REQUIRE MODIFICATION / REJECT AS SUSPICIOUS]`,
    `   - A short final summary explaining your trust score.`,
    ``,
    `---`,
    `## BUNDLED SCRIPTS FOR INSPECTION (${scriptCount} total):`,
    ``,
  ].join("\n");

  const scriptSections = validScripts
    .map((s, index) => {
      const idx = index + 1;
      const target = s.executor ? ` (Target: ${s.executor})` : "";
      return [
        `### SCRIPT ${idx}/${scriptCount}: \`${s.fileName}\`${target}`,
        "```python",
        s.scriptContent?.trim(),
        "```",
        "",
      ].join("\n");
    })
    .join("\n");

  const footer = [
    `---`,
    `Please proceed with your thorough security assessment and provide your audit report now.`,
  ].join("\n");

  return `${header}\n${scriptSections}\n${footer}`;
}

/**
 * Downloads a script as a .py text file to the user's computer.
 */
export function downloadScriptFile(fileName: string, content: string | null | undefined): void {
  if (!content) return;
  const safeName = fileName.endsWith(".py") ? fileName : `${fileName}.py`;
  const blob = new Blob([content], { type: "text/x-python;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

