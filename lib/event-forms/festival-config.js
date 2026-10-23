export const FESTIVAL_PATH='/harrow-food-festival-2026/get-involved';
export const FESTIVAL_ADMIN_PATH='/admin/harrow-food-festival-2026';
export const FESTIVAL_PRIVACY='ICSH will use the information submitted through this form to coordinate participation, manage contributions, communicate event arrangements, and administer the Harrow Food Festival 2026. Personal information will be handled in accordance with ICSH\'s privacy policy.';
export const FUNDRAISING_ACK='I understand that this event is organised to raise funds for UK charities and ICSH community projects, and that any funds I agree to contribute or remit to ICSH will be handled in accordance with the event\'s published fundraising arrangements.';
export const COOKING_ACKS=[
 'I understand that I must follow appropriate food hygiene and food safety requirements when preparing, storing, transporting, and serving food.',
 'I agree to provide accurate information about ingredients and allergens and follow the event organisers\' food safety instructions.',
 'I understand that my food contribution and any arrangements for selling it must be agreed with the event organisers.'
];
export const VOLUNTEER_ACK='I understand that submitting this form does not automatically confirm my volunteer assignment and that the ICSH organising team will contact me with further information.';
export const MARKETING_ACK='I would like to receive updates about future ICSH events and community activities.';
export function defaultFestivalConfig(){return {
 version:1,eventName:'Harrow Food Festival 2026',formTitle:'Harrow Food Festival 2026 – Volunteer, Donation & Cooking Form',status:'published',
 startsAt:'2026-12-13T12:00:00.000Z',endsAt:'2026-12-13T17:00:00.000Z',venue:'Harrow Central Mosque',
 introduction:"Join us on Sunday, 13 December 2026, at Harrow Central Mosque for a special community food festival.\n\nWe're bringing our community together to enjoy delicious food while raising funds to support UK charities and ICSH community projects.\n\nWe're looking for enthusiastic volunteers, home cooks, and generous supporters to help make this event a success.\n\nWhether you would like to prepare food, contribute a donation, or volunteer your time, we'd love to hear from you!\n\nComplete the form below to get involved.",
 beneficiaries:'UK charities and ICSH community projects',supportedCharities:'Mind and provisionally Dementia UK (subject to confirmation)',privacyPolicyUrl:'',
 enabled:{cook:true,donate:true,volunteer:true},
 cookingCategories:['Main dish','Starter or snack','Dessert','Baked goods','Drinks','Other'],
 allergens:['Milk','Eggs','Peanuts','Tree nuts','Wheat / Gluten','Soy','Fish','Shellfish','Sesame','Other','None known'],
 provisionOptions:['I will bring the prepared food to the venue.','I need assistance transporting the food.','I would like to discuss arrangements with the organisers.'],
 donationAmounts:[{id:'small',label:'Small contribution',amount:500},{id:'supporting',label:'Supporting contribution',amount:1000},{id:'generous',label:'Generous contribution',amount:2000},{id:'major',label:'Major contribution',amount:5000}],
 activities:['Event setup','Food stall assistance','Serving food','Welcoming visitors','Registration and information desk','Cleaning and tidying','Event coordination','Packing up after the event','Wherever help is needed','Other'],
 shifts:[{id:'setup',label:'Before the event',description:'Setup'},{id:'early',label:'12:00 PM – 2:00 PM',description:'Early shift'},{id:'afternoon',label:'2:00 PM – 4:00 PM',description:'Afternoon shift'},{id:'final',label:'4:00 PM – 5:00 PM',description:'Final event hour'},{id:'cleanup',label:'After 5:00 PM',description:'Cleanup'},{id:'flexible',label:'Flexible',description:'Any time'}],
 customQuestions:[],consentVersion:'harrow-2026-v1',mode:'live'
};}
export function hydrateFestival(state){state.festivalConfig??=defaultFestivalConfig();state.festivalRegistrations??=[];return state;}
