import {z} from 'zod';
export const iftariMenuSchema=z.object({enabled:z.boolean(),title:z.string().trim().min(1).max(100),courses:z.array(z.object({title:z.string().trim().min(1).max(60),items:z.array(z.string().trim().min(1).max(80)).min(1).max(15)}).strict()).min(1).max(8)}).strict();
export type IftariMenu=z.infer<typeof iftariMenuSchema>;
export const defaultIftariMenu:IftariMenu={enabled:true,title:'Your Iftari menu',courses:[
 {title:'Starters',items:['Peri peri tikka','Seekh kebab','Palak pata chat','Hara bhara kebab']},
 {title:'Main courses',items:['Butter chicken','Lamb rogan Josh','Dal makhnai','Bhindi do pyaz']},
 {title:'Sides',items:['Jeera rice','Raita / salad','Mix breads']},
 {title:'Desserts',items:['Gajjer halwa','Kulfi']},
]};
