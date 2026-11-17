import test from 'node:test';import assert from 'node:assert/strict';import {attachmentType} from '../lib/events-hub/task-files.ts';
test('task attachments reject executable/HTML disguises and mismatched file signatures',()=>{
 for(const name of ['photo.jpg','notes.pdf','program.exe','page.html'])assert.equal(attachmentType(name,Buffer.from('<script>alert(1)</script>')),null);
 assert.equal(attachmentType('agenda.pdf',Buffer.from('%PDF-1.7')).mime,'application/pdf');assert.equal(attachmentType('notes.txt',Buffer.from('Event notes')).mime,'text/plain');assert.equal(attachmentType('notes.txt',Buffer.from([0,1,2])),null);
 assert.equal(attachmentType('photo.jpg',Buffer.from([255,216,255])).mime,'image/jpeg');assert.equal(attachmentType('plan.docx',Buffer.from([80,75,3,4])).mime,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});
