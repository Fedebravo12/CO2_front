import { execSync } from 'node:child_process'

const PORT = 5173
const isWindows = process.platform === 'win32'

function listeningPids() {
  if (isWindows) {
    const out = execSync('netstat -ano', { encoding: 'utf8' })
    const pids = new Set()
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes('LISTENING') || !line.includes(`:${PORT}`)) continue
      const pid = line.trim().split(/\s+/).pop()
      if (pid && pid !== '0' && pid !== String(process.pid)) pids.add(pid)
    }
    return [...pids]
  }

  try {
    const out = execSync(`lsof -tiTCP:${PORT} -sTCP:LISTEN`, { encoding: 'utf8' })
    return out
      .split(/\r?\n/)
      .map((pid) => pid.trim())
      .filter((pid) => pid && pid !== String(process.pid))
  } catch {
    return []
  }
}

function killPid(pid) {
  const command = isWindows ? `taskkill /PID ${pid} /F` : `kill -9 ${pid}`
  execSync(command, { stdio: 'ignore' })
}

for (const pid of listeningPids()) {
  try {
    killPid(pid)
  } catch {
    // el proceso ya no existe
  }
}
