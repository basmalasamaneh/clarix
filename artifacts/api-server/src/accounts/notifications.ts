export interface NotificationProvider {
 notify(event:{kind:"reset-issued"|"reset-completed"|"mfa-policy";factoryId:string;subjectId?:string}):Promise<void>;
}
// Intentionally no delivery or persistence. Tokens/passwords are not part of
// the interface; adding email later requires a separately reviewed delivery path.
export const notifications:NotificationProvider={async notify(){ }};
