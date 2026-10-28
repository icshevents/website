import definitions from './fields.json' with {type:'json'};

export type Answers = Record<string,string|boolean|string[]>;
export type RishtaField = {id:string;label:string;required:boolean;type:string;options:string[];hints:string[];other?:boolean;condition?:{field:string;values:string[]}};
export const fields = definitions as RishtaField[];
export const termsVersion = 'rishta-submission-and-sensitive-consent-2026-10-27';
export const steps = [
  {title:'Personal information',ids:['Name_first','Name_last','Dropdown','Date','Number','Dropdown1','SingleLine4','SingleLine5','DecisionBox','Checkbox','SingleLine3','SingleLine2','SingleLine6','ImageUpload']},
  {title:'Your background',ids:['Dropdown8','MultiLine','SingleLine9','SingleLine10','SingleLine11','SingleLine12','Dropdown9','Radio5','Dropdown12','Dropdown6','Radio1','Dropdown7']},
  {title:'Lifestyle & personality',ids:['MultiLine1','Radio2','MultiLine2']},
  {title:'Marriage preferences',ids:['SingleLine15','SingleLine18','SingleLine16','SingleLine17','Dropdown14','Dropdown15','Dropdown16','MultiLine3','MultiLine4']},
  {title:'Additional information',ids:['MultiLine5']},
  {title:'Review your profile',ids:['TermsConditions','SensitiveConsent']},
];
export function visible(field:RishtaField,answers:Answers):boolean {
  if(!field.condition)return true;
  const parent=fields.find(f=>f.id===field.condition!.field);
  return (!parent||visible(parent,answers))&&field.condition.values.includes(String(answers[field.condition.field]??''));
}
export function normaliseDob(value:string):string {const uk=/^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(value);return uk?`${uk[3]}-${uk[2]}-${uk[1]}`:value;}
export function ageFromDob(dob:string,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date())):number|null {
  dob=normaliseDob(dob);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dob))return null;
  const date=new Date(dob+'T12:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==dob||dob>today)return null;
  const [y,m,d]=dob.split('-').map(Number),[ty,tm,td]=today.split('-').map(Number);
  return ty-y-(tm<m||(tm===m&&td<d)?1:0);
}
export function cleanAnswers(input:unknown,today?:string):{answers:Answers;errors:Record<string,string>} {
  const source=input&&typeof input==='object'&&!Array.isArray(input)?input as Answers:{};
  const answers:Answers={},errors:Record<string,string>={};
  for(const f of fields){
    if(['ImageUpload','Number'].includes(f.id))continue;
    const value=source[f.id];
    if(f.id==='Checkbox')answers[f.id]=Array.isArray(value)?[...new Set(value.filter(v=>typeof v==='string'&&f.options.includes(v)))]:[];
    else if(['DecisionBox','TermsConditions','SensitiveConsent'].includes(f.id))answers[f.id]=value===true;
    else answers[f.id]=typeof value==='string'?value.trim().slice(0,f.type==='2'?65535:255):'';
  }
  for(const f of fields){
    if(!visible(f,answers)){delete answers[f.id];continue;}
    if(f.id==='Number'||f.id==='ImageUpload')continue;
    const v=answers[f.id];
    if(f.required&&(v===false||v===''||v===undefined))errors[f.id]=f.id==='SensitiveConsent'?'Please give explicit consent to the use of sensitive profile information before submitting.':f.id==='TermsConditions'?'Please acknowledge the service terms by submitting your profile.':'Please complete this field.';
    if(f.options.length&&f.id!=='Checkbox'&&v&&!f.options.includes(String(v)))errors[f.id]='Please choose one of the listed options.';
    if(f.other&&v==='Other'){
      const other=source[f.id+'_other'];answers[f.id+'_other']=typeof other==='string'?other.trim().slice(0,150):'';
      if(!answers[f.id+'_other'])errors[f.id+'_other']='Please provide the other option.';
    }
  }
  const age=ageFromDob(String(answers.Date||''),today);
  if(age===null)errors.Date='Please enter a valid date of birth.';
  else if(age<18||age>120)errors.Date='This service is for adults aged 18 and above. Please check your date of birth.';
  else {answers.Number=String(age);answers.Date=normaliseDob(String(answers.Date));}
  if(answers.SingleLine4&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(answers.SingleLine4)))errors.SingleLine4='Please enter a valid email address.';
  if(answers.SingleLine5&&!/^\+?[\d ()-]{7,30}$/.test(String(answers.SingleLine5)))errors.SingleLine5='Please enter a valid mobile number, including the country code if outside the UK.';
  return {answers,errors};
}
