import {z} from 'zod';
const menuDish=z.string().trim().min(1,'Enter a dish name.').max(80,'Keep each dish name within 80 characters.');
export const iftariMenuSchema=z.object({enabled:z.boolean(),title:z.string().trim().max(100,'Keep the menu heading within 100 characters.'),courses:z.array(z.object({title:z.string().trim().max(60,'Keep each course heading within 60 characters.'),items:z.preprocess(value=>Array.isArray(value)?value.filter(item=>typeof item!=='string'||item.trim()!==''):value,z.array(menuDish).max(15,'Use up to 15 dishes per course.'))}).strict()).max(8,'Use up to 8 courses.')}).strict().superRefine((menu,ctx)=>{
 if(!menu.enabled)return;
 if(!menu.title)ctx.addIssue({code:'custom',path:['title'],message:'Enter a menu heading.'});
 if(!menu.courses.length)ctx.addIssue({code:'custom',path:['courses'],message:'Add at least one menu course, or switch off the menu.'});
 menu.courses.forEach((course,i)=>{if(!course.title)ctx.addIssue({code:'custom',path:['courses',i,'title'],message:'Enter a heading for course '+(i+1)+'.'});if(!course.items.length)ctx.addIssue({code:'custom',path:['courses',i,'items'],message:'Add at least one dish to '+(course.title||'course '+(i+1))+', or remove that course.'});});
});
export type IftariMenu=z.infer<typeof iftariMenuSchema>;
export const defaultIftariMenu:IftariMenu={enabled:true,title:'Your Iftari menu',courses:[
 {title:'Starters',items:['Peri peri tikka','Seekh kebab','Palak pata chat','Hara bhara kebab']},
 {title:'Main courses',items:['Butter chicken','Lamb rogan Josh','Dal makhnai','Bhindi do pyaz']},
 {title:'Sides',items:['Jeera rice','Raita / salad','Mix breads']},
 {title:'Desserts',items:['Gajjer halwa','Kulfi']},
]};

export const defaultEventMenu:IftariMenu={enabled:false,title:'Event menu',courses:[]};
export const resolveEventMenu=(menu:IftariMenu|undefined,sourceType:string):IftariMenu=>menu??(sourceType==='iftari'?defaultIftariMenu:defaultEventMenu);
