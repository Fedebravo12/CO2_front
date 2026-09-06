import { execSync } from 'node:child_process'

const PORT = 5173

function listeningPids() {
  const out = execSync('netstat -ano', { encoding: 'utf8' })
  const pids = new Set()
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes('LISTENING') || !line.includes(`:${PORT}`)) continue
    const pid = line.trim().split(/\s+/).pop()
    if (pid && pid !== '0' && pid !== String(process.pid)) pids.add(pid)
  }
  return [...pids]
}

for (const pid of listeningPids()) {
  try {
    execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
  } catch {
    // el proceso ya no existe
  }
}
