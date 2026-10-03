/**
 * Build Android APK from project root.
 * Runs: vite build, cap sync, then Gradle assembleDebug.
 * The app shell loads the live site (capacitor.config.json server.url), so
 * the APK only needs rebuilding when Android settings or the URL change.
 * Requires: Node.js, JDK (JAVA_HOME set), and Android SDK for Gradle.
 */
const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const isWin = process.platform === 'win32';
const gradleCmd = isWin ? 'gradlew.bat' : './gradlew';

if (!process.env.JAVA_HOME) {
  console.error('\n❌ JAVA_HOME is not set. Gradle needs a JDK to build the APK.\n');
  console.error('Options:');
  console.error('  1) Install Android Studio – it includes a JDK. Then set JAVA_HOME to:');
  console.error('     C:\\Program Files\\Android\\Android Studio\\jbr');
  console.error('  2) Or install a standalone JDK 17 from https://adoptium.net/ and set JAVA_HOME to its folder.\n');
  console.error('Then in PowerShell (run as Administrator if needed):');
  console.error('  [System.Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\\Program Files\\Android\\Android Studio\\jbr", "User")\n');
  console.error('Close and reopen the terminal, then run: npm run apk\n');
  process.exit(1);
}

console.log('1/3 Building web assets...');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

console.log('\n2/3 Syncing Capacitor (android)...');
execSync('npx cap sync android', { cwd: root, stdio: 'inherit' });

console.log('\n3/3 Building APK...');
execSync(`${gradleCmd} assembleDebug`, { cwd: path.join(root, 'android'), stdio: 'inherit' });

console.log('\n✅ APK built: android/app/build/outputs/apk/debug/');
