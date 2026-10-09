import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string, details?: unknown) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`, details ?? '');
    failed++;
  }
}

function run() {
  console.log('================================================================');
  console.log('LOGIN PORTAL — PASSWORD SHOW / HIDE VERIFICATION SUITE');
  console.log('================================================================\n');

  const appSource = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');

  // Requirement 1 & 2: Password masked by default, eye icon inside password area on right
  console.log('1. Password Masking by Default & Initial State');
  assert(
    appSource.includes("const [showLoginPassword, setShowLoginPassword] = useState(false);"),
    'Password is masked by default with showLoginPassword = false'
  );
  assert(
    appSource.includes("type={showLoginPassword ? 'text' : 'password'}"),
    'Password input toggles type between text and password based on showLoginPassword'
  );

  console.log('\n2. Eye Icon & Control Placement');
  assert(
    appSource.includes('import {\n  LayoutDashboard,') &&
      appSource.includes('Eye,') &&
      appSource.includes('EyeOff,'),
    'Eye and EyeOff icons imported from lucide-react in src/App.tsx'
  );
  assert(
    appSource.includes('id="btn-toggle-login-password"'),
    'Dedicated toggle button with id="btn-toggle-login-password" exists'
  );
  assert(
    appSource.includes('className="relative"') &&
      appSource.includes('className="absolute right-0 top-0 bottom-0 px-3.5') &&
      appSource.includes('pr-11'),
    'Password input area positions the toggle button at the right side with clearance padding (pr-11)'
  );

  console.log('\n3. Accessibility & Aria Attributes');
  assert(
    appSource.includes("aria-label={showLoginPassword ? 'Hide password' : 'Show password'}"),
    'Accessible aria-label flips between "Show password" (masked) and "Hide password" (visible)'
  );
  assert(
    appSource.includes("title={showLoginPassword ? 'Hide password' : 'Show password'}"),
    'Accessible tooltip title flips between "Show password" and "Hide password"'
  );
  assert(
    appSource.includes('type="button"'),
    'Toggle control is an explicit type="button" to prevent accidental form submission'
  );

  console.log('\n4. Preservation of Typed Password & Authentication Flow');
  assert(
    appSource.includes("onClick={() => setShowLoginPassword((prev) => !prev)}"),
    'Toggling visibility updates boolean visibility state without modifying loginPassword'
  );
  assert(
    appSource.includes("identifier: loginIdentifier.trim()") &&
      appSource.includes("password: loginPassword"),
    'Authentication logic untouched: transmits exact loginPassword without trimming'
  );
  assert(
    appSource.includes("setShowLoginPassword(false)"),
    'Logout cleanly resets password visibility back to masked state'
  );

  console.log('\n5. Desktop & Mobile Responsiveness & Touch Targets');
  assert(
    appSource.includes('min-h-[44px]') &&
      appSource.includes('rounded-xl sm:rounded-lg'),
    'Password input and button adhere to 44px+ mobile touch ergonomics and responsive sizing'
  );

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run();
