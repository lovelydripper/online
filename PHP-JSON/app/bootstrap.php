<?php
declare(strict_types=1);
const DATA_DIR = __DIR__ . '/../data';
function initial_store(): array {
    $catalog = json_decode(file_get_contents(__DIR__ . '/catalog.json'), true, 512, JSON_THROW_ON_ERROR);
    return ['users'=>[], 'sessions'=>[], 'orders'=>[], 'messages'=>[], 'attempts'=>[], 'products'=>$catalog];
}
function store(callable $fn) {
    if (!is_dir(DATA_DIR)) mkdir(DATA_DIR, 0700, true);
    $lock = fopen(DATA_DIR . '/store.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('Storage unavailable');
    try {
        $path = DATA_DIR . '/store.json';
        $db = is_file($path) ? json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR) : initial_store();
        $before = json_encode($db, JSON_THROW_ON_ERROR);
        $result = $fn($db);
        $after = json_encode($db, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        if (!is_file($path) || $before !== json_encode($db, JSON_THROW_ON_ERROR)) {
            $tmp = tempnam(DATA_DIR, 'store-');
            if (file_put_contents($tmp, $after) === false) throw new RuntimeException('Cannot save data');
            chmod($tmp, 0600);
            if (!rename($tmp, $path)) throw new RuntimeException('Cannot commit data');
        }
        return $result;
    } finally { flock($lock, LOCK_UN); fclose($lock); }
}
function uid(): string {return bin2hex(random_bytes(12));}
function public_user(array $u): array { return array_intersect_key($u, array_flip(['id','name','email','phone','role','created_at'])); }
function fail(string $message, int $status=400): never {http_response_code($status); $payload=['error'=>$message]; if($status===403 && isset($_SESSION['csrf'])) $payload['csrf']=$_SESSION['csrf']; echo json_encode($payload); exit;}
function text_field(array $input, string $key, int $min=1, int $max=200): string {
    $v=$input[$key]??null;
    if(!is_string($v)) fail("Please check $key.");
    $v=trim($v);
    if(strlen($v)<$min || strlen($v)>$max) fail("Please check $key (maximum $max characters).");
    return $v;
}
function normalize_phone(string $value): string {
    $phone=preg_replace('/[()\s-]/','',$value)??'';
    if(!preg_match('/^\+374\d{8}$/',$phone)) fail('Enter an Armenian phone number beginning with +374.');
    return $phone;
}
function phone_field(array $input): string { return normalize_phone(text_field($input,'phone',4,24)); }
function login_identifier(array $input): array {
    $key=array_key_exists('identifier',$input)?'identifier':'email';
    $raw=text_field($input,$key,3,254);
    $compact=str_replace([' ','-','(',')'],'',$raw);
    if(str_starts_with($compact,'+374')) return ['phone'=>normalize_phone($raw)];
    if(!filter_var($raw,FILTER_VALIDATE_EMAIL)) fail('Enter a valid Gmail address or Armenian phone number.');
    return ['email'=>strtolower($raw)];
}
function is_secure(): bool { return !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'; }
function set_auth_cookie(string $token, int $expires): void {
    setcookie('lovely_session', $token, ['expires'=>$expires,'path'=>'/','secure'=>is_secure(),'httponly'=>true,'samesite'=>'Lax']);
}
function current_user(array $db): ?array {
    $token=$_COOKIE['lovely_session']??'';
    if(!is_string($token) || strlen($token)!==64) return null;
    $s=$db['sessions'][hash('sha256',$token)]??null;
    if(!$s || $s['expires']<time()) return null;
    return $db['users'][$s['user_id']]??null;
}
function require_user(array $db, bool $admin=false): array {
    $u=current_user($db);
    if(!$u) fail('Please sign in to continue.',401);
    if($admin && $u['role']!=='admin') fail('Administrator access required.',403);
    return $u;
}
