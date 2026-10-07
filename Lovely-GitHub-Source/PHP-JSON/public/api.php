<?php
declare(strict_types=1);
require __DIR__.'/../app/bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
ini_set('display_errors','0');
ini_set('log_errors','1');
ini_set('session.use_strict_mode','1');
if(!is_dir(DATA_DIR.'/sessions')) mkdir(DATA_DIR.'/sessions',0700,true);
session_save_path(DATA_DIR.'/sessions');
session_set_cookie_params(['httponly'=>true,'secure'=>is_secure(),'samesite'=>'Strict','path'=>'/']);
if(!session_start()) fail('Session storage is unavailable.',503);
$_SESSION['csrf'] ??= bin2hex(random_bytes(32));
$input=[];
$action=$_GET['action']??'bootstrap';
$method=$_SERVER['REQUEST_METHOD'];
if($method==='POST') {
    if(!hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN']??'')) fail('Your session refreshed. Reload this page and try again.',403);
    if((int)($_SERVER['CONTENT_LENGTH']??0)>65536) fail('Request too large.',413);
    try { $input=json_decode(file_get_contents('php://input'),true,64,JSON_THROW_ON_ERROR); }
    catch(Throwable $e){fail('Invalid request.');}
    if(!is_array($input)) fail('Invalid request.');
} elseif($method!=='GET') fail('Method not allowed.',405);
$write=['register','login','admin_login','logout','order','message','read','status','product'];
if(in_array($action,$write,true) && $method!=='POST') fail('Method not allowed.',405);
try {
$result=store(function(array &$db) use($action,$input){
    if($action==='bootstrap') return ['user'=>($u=current_user($db))?public_user($u):null,'csrf'=>$_SESSION['csrf'],'products'=>array_values(array_filter($db['products'],fn($p)=>$p['active']))];
    if($action==='register' || $action==='login' || $action==='admin_login') {
        $email='';$phone='';
        if($action==='login') { $identity=login_identifier($input); $email=$identity['email']??''; $phone=$identity['phone']??''; }
        else { $email=strtolower(text_field($input,'email',3,254)); if(!filter_var($email,FILTER_VALIDATE_EMAIL)) fail('Enter a valid email address.'); if($action==='register') $phone=phone_field($input); }
        $password=$input['password']??'';
        if(!is_string($password) || strlen($password)>72 || strlen($password)<10) fail('Use a password between 10 and 72 characters.');
        $key=hash('sha256',($_SERVER['REMOTE_ADDR']??'local').':'.$action.':'.($email?:$phone));
        $now=time();
        $db['attempts']=array_filter($db['attempts'],fn($v)=>$v['until']>$now);
        $rate=$db['attempts'][$key]??['count'=>0,'until'=>$now+900];
        if($rate['count']>=10) return ['_error'=>'Too many attempts. Try again in 15 minutes.','_status'=>429];
        $rate['count']++; $db['attempts'][$key]=$rate;
        $found=null;
        foreach($db['users'] as $u) if($email!=='' ? ($u['email']??'')===$email : ($u['phone']??'')===$phone) {$found=$u;break;}
        if($action==='register') {
            $name=text_field($input,'name',2,80);
            if($found) return ['_error'=>'An account already uses this email or phone number. Please sign in.','_status'=>409];
            foreach($db['users'] as $u) if(($u['phone']??'')===$phone) return ['_error'=>'An account already uses this phone number. Please sign in.','_status'=>409];
            $found=['id'=>uid(),'name'=>$name,'email'=>$email,'phone'=>$phone,'password_hash'=>password_hash($password,PASSWORD_DEFAULT),'role'=>'customer','created_at'=>gmdate('c')];
            $db['users'][$found['id']]=$found;
        } else {
            if(!$found || ($action==='admin_login' && $found['role']!=='admin') || ($action==='login' && $found['role']==='admin') || !password_verify($password,$found['password_hash'])) return ['_error'=>'Email/phone or password is incorrect.','_status'=>401];
            unset($db['attempts'][$key]);
        }
        session_regenerate_id(true);
        $token=bin2hex(random_bytes(32));
        $remember=($input['remember']??false)===true;
        $expires=$now+($remember?2592000:43200);
        $db['sessions']=array_filter($db['sessions'],fn($s)=>$s['expires']>$now);
        $db['sessions'][hash('sha256',$token)]=['user_id'=>$found['id'],'expires'=>$expires];
        set_auth_cookie($token,$remember?$expires:0);
        return ['user'=>public_user($found),'csrf'=>$_SESSION['csrf']];
    }
    if($action==='logout') {
        unset($db['sessions'][hash('sha256',$_COOKIE['lovely_session']??'')]);
        set_auth_cookie('',time()-3600); session_regenerate_id(true); $_SESSION['csrf']=bin2hex(random_bytes(32));
        return ['ok'=>true,'csrf'=>$_SESSION['csrf']];
    }
    $u=require_user($db,in_array($action,['admin','status','product'],true));
    if($action==='orders') return ['orders'=>array_values(array_reverse(array_filter($db['orders'],fn($o)=>$o['user_id']===$u['id'])))];
    if($action==='order') {
        $key=text_field($input,'request_key',16,100);
        foreach($db['orders'] as $o) if($o['user_id']===$u['id'] && $o['request_key']===$key) return ['order'=>$o];
        $items=$input['items']??[];
        if(!is_array($items)||count($items)<1||count($items)>30) fail('Add between 1 and 30 items to your bag.');
        $recent=array_filter($db['orders'],fn($o)=>$o['user_id']===$u['id'] && strtotime($o['created_at'])>time()-3600);
        if(count($recent)>=10) fail('Too many requests. Please message us about your existing request.',429);
        $lines=[];$total=0;
        foreach($items as $i) {
            if(!is_array($i)) fail('Invalid item.');
            $p=$db['products'][$i['id']??'']??null;
            $qty=$i['quantity']??0;
            if(!$p || !$p['active']) fail('An item is no longer available. Refresh your bag.');
            if(!is_int($qty)||$qty<1||$qty>10||!in_array($i['color']??'',array_column($p['colors'],'name'),true)||!in_array($i['size']??'',$p['sizes'],true)) fail('Choose a valid color, size and quantity.');
            $lines[]=['id'=>$p['id'],'name'=>$p['name'],'image'=>$p['images'][0],'price'=>$p['price'],'color'=>$i['color'],'size'=>$i['size'],'quantity'=>$qty];
            $total+=$p['price']*$qty;
        }
        $note=isset($input['note'])?text_field($input,'note',0,1000):'';
        $o=['id'=>uid(),'number'=>'LV-'.str_pad((string)(count($db['orders'])+1),5,'0',STR_PAD_LEFT),'user_id'=>$u['id'],'name'=>$u['name'],'email'=>$u['email'],'phone'=>$u['phone']??null,'items'=>$lines,'total'=>$total,'currency'=>'AMD','status'=>'new','note'=>$note,'request_key'=>$key,'created_at'=>gmdate('c')];
        $db['orders'][$o['id']]=$o;
        $db['messages'][]=['id'=>uid(),'user_id'=>$u['id'],'sender'=>'system','text'=>'Request '.$o['number'].' received. Lovely will confirm availability and delivery with you here. No payment has been taken.','created_at'=>gmdate('c'),'read_at'=>null];
        return ['order'=>$o];
    }
    if($action==='messages'||$action==='message'||$action==='read') {
        $target=$u['role']==='admin'?($input['user_id']??$_GET['user_id']??$u['id']):$u['id'];
        if(!is_string($target)||!isset($db['users'][$target])) fail('Customer not found.',404);
        if($action==='message') {
            $body=text_field($input,'text',1,2000);
            $recent=array_filter($db['messages'],fn($m)=>$m['user_id']===$target && $m['sender']===($u['role']==='admin'?'admin':'customer') && strtotime($m['created_at'])>time()-60);
            if(count($recent)>=15) fail('Please wait a minute before sending more messages.',429);
            $db['messages'][]=['id'=>uid(),'user_id'=>$target,'sender'=>$u['role']==='admin'?'admin':'customer','text'=>$body,'created_at'=>gmdate('c'),'read_at'=>null];
        }
        if($action==='read') foreach($db['messages'] as &$m) if($m['user_id']===$target && ($u['role']==='admin'?$m['sender']==='customer':$m['sender']!=='customer')) $m['read_at']=gmdate('c');
        $all=array_values(array_filter($db['messages'],fn($m)=>$m['user_id']===$target));
        $before=$_GET['before']??null;
        if($before) $all=array_values(array_filter($all,fn($m)=>$m['created_at']<$before));
        return ['messages'=>array_slice($all,-100),'has_more'=>count($all)>100,'customer'=>public_user($db['users'][$target])];
    }
    if($action==='admin') {
        $view=$_GET['view']??'orders';$q=strtolower(substr($_GET['q']??'',0,100));$page=max(1,(int)($_GET['page']??1));
        $rows=match($view){'customers'=>array_values(array_map('public_user',$db['users'])),'products'=>array_values($db['products']),default=>array_values(array_reverse($db['orders']))};
        if($q!=='') $rows=array_values(array_filter($rows,fn($r)=>str_contains(strtolower(json_encode($r)),$q)));
        $threads=[];
        foreach($db['messages'] as $m){$id=$m['user_id'];$c=$db['users'][$id];$unread=($threads[$id]['unread']??0)+($m['sender']==='customer' && !$m['read_at']?1:0);$threads[$id]=['user_id'=>$id,'name'=>$c['name'],'email'=>$c['email'],'phone'=>$c['phone']??null,'last'=>$m['text'],'created_at'=>$m['created_at'],'unread'=>$unread];}
        usort($threads,fn($a,$b)=>strcmp($b['created_at'],$a['created_at']));
        if($view==='messages') {$rows=$threads;if($q!=='')$rows=array_values(array_filter($rows,fn($r)=>str_contains(strtolower(json_encode($r)),$q)));}
        return ['rows'=>array_slice($rows,($page-1)*20,20),'total'=>count($rows),'page'=>$page,'stats'=>['requests'=>count($db['orders']),'new'=>count(array_filter($db['orders'],fn($o)=>$o['status']==='new')),'customers'=>count(array_filter($db['users'],fn($u)=>$u['role']==='customer')),'unread'=>array_sum(array_column($threads,'unread'))]];
    }
    if($action==='status') {
        $id=text_field($input,'id');$status=$input['status']??'';
        if(!isset($db['orders'][$id])) fail('Request not found.',404);
        if(!in_array($status,['new','contacted','confirmed','fulfilled','cancelled'],true)) fail('Invalid status.');
        $db['orders'][$id]['status']=$status;return ['ok'=>true];
    }
    if($action==='product') {
        $id=isset($input['id'])?text_field($input,'id'):uid();
        $name=text_field($input,'name',2,100);$description=text_field($input,'description',10,2000);$category=text_field($input,'category',2,40);
        $price=$input['price']??null;$old=$input['original_price']??null;
        if(!is_int($price)||$price<1||$price>10000000||!is_int($old)||$old<$price) fail('Check product prices.');
        $images=$input['images']??[];$sizes=$input['sizes']??[];$colors=$input['colors']??[];
        if(!is_array($images)||count($images)<4||count($images)>12) fail('Add 4–12 product images.');
        foreach($images as $url) if(!is_string($url)||strlen($url)>1000||!(preg_match('~^assets/[a-zA-Z0-9_./-]+$~',$url)||filter_var($url,FILTER_VALIDATE_URL)&&str_starts_with($url,'https://'))) fail('Use valid HTTPS image URLs.');
        if(!is_array($sizes)||count($sizes)<1||count($sizes)>20) fail('Add at least one size.');
        foreach($sizes as $s) if(!is_string($s)||strlen($s)>30||trim($s)==='') fail('Check sizes.');
        if(!is_array($colors)||count($colors)<1||count($colors)>20) fail('Add at least one color.');
        foreach($colors as $c) if(!is_array($c)||!is_string($c['name']??null)||strlen($c['name'])<1||strlen($c['name'])>30||!preg_match('/^#[a-fA-F0-9]{6}$/',$c['hex']??'')) fail('Check color names and hex codes.');
        $p=['id'=>$id,'name'=>$name,'description'=>$description,'category'=>$category,'price'=>$price,'original_price'=>$old,'images'=>array_values($images),'sizes'=>array_values($sizes),'colors'=>array_values($colors),'active'=>($input['active']??true)===true,'badge'=>isset($input['badge'])?text_field($input,'badge',0,30):''];
        $db['products'][$id]=$p;return ['product'=>$p];
    }
    fail('Not found.',404);
});
if(isset($result['_error'])) {http_response_code($result['_status']);$result=['error'=>$result['_error']];}
echo json_encode($result,JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
} catch(Throwable $e) {error_log($e->getMessage());fail('Something went wrong. Please try again shortly.',500);}
