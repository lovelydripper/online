<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../app/bootstrap.php';
$email=strtolower(trim($argv[1]??''));$name=trim($argv[2]??'Lovely Admin');
if(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($name)<2||strlen($name)>80){fwrite(STDERR,"Usage: php bin/create-admin.php your@email.com 'Your Name'\n");exit(1);}
fwrite(STDOUT,"New admin password (10–72 characters): ");
$hidden=PHP_OS_FAMILY!=='Windows'&&function_exists('shell_exec')&&stream_isatty(STDIN);
if($hidden)shell_exec('stty -echo');
try{$password=rtrim(fgets(STDIN)?:'',"\r\n");}finally{if($hidden)shell_exec('stty echo');fwrite(STDOUT,"\n");}
if(strlen($password)<10||strlen($password)>72){fwrite(STDERR,"Password must contain 10–72 characters.\n");exit(1);}
store(function(array &$db)use($email,$name,$password){
    $id=null;foreach($db['users'] as $u)if($u['email']===$email)$id=$u['id'];
    $id??=uid();$db['users'][$id]=['id'=>$id,'name'=>$name,'email'=>$email,'role'=>'admin','password_hash'=>password_hash($password,PASSWORD_DEFAULT),'created_at'=>$db['users'][$id]['created_at']??gmdate('c')];
    $db['sessions']=array_filter($db['sessions'],fn($s)=>$s['user_id']!==$id);
});
fwrite(STDOUT,"Admin account ready. Sign in through the website, then open Admin studio in the footer.\n");
