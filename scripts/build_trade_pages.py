#!/usr/bin/env python3
"""Build the November trade articles from saved, read-only local measurements.

No requests are made. --check renders into a temporary directory and compares bytes.
The prose lives here so each trade has its own argument, rather than swapped nouns.
"""
from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
import re
import tempfile

ROOT = Path(__file__).resolve().parents[1]
DATA = Path('/Users/matthewkerr/ops/search/measurements/local-sweep')
DATE = '2026-11-11'
BASE = 'https://builtbykerr.com/'
EXISTING = ('plumber', 'roofing-company', 'dentist', 'electrician', 'hvac-company',
            'landscaper', 'painter', 'remodeler')

# Public count labels deliberately differ from the collector's internal names.
MEASURES = {
    'businesses': ('businesses', 'Businesses counted once across towns'),
    'listed': ('website_listed', 'Listings with a business website'),
    'absent': ('no_website_listed', 'Listings with no website or social profile'),
    'social': ('social_profile_listed', 'Listings linking to a social or directory profile'),
    'other': ('not_business_site', 'Listed websites excluded as not the business site'),
    'read': ('site_read', 'Business homepages that loaded and could be read'),
    'unreadable': ('site_unreadable', 'Listed websites that could not be read'),
    'overlap': ('listed_in_more_than_one_town', 'Businesses listed in more than one town'),
    'total': ('listings_total', 'Local listings before counting repeat businesses once'),
    'coverage': ('towns_with_listings', 'Towns returning local listings'),
    'secure': ('of_sites_read.https', 'HTTPS connection'),
    'calls': ('of_sites_read.tap_to_call', 'A tap-to-call phone link'),
    'markup': ('of_sites_read.business_schema', 'Local business details in structured markup'),
    'faqs': ('of_sites_read.faq', 'An FAQ heading or FAQ structured markup'),
    'mobile': ('of_sites_read.mobile_viewport', 'A setting that fits the layout to a phone screen'),
    'money': ('of_sites_read.dollar_figure', 'An amount of money in visible text, including offers'),
    'estimate': ('of_sites_read.free_estimate', 'A free estimate, quote, inspection or consultation mentioned'),
    'finance': ('of_sites_read.financing', 'Financing or monthly payments mentioned'),
    'urgent': ('of_sites_read.emergency', 'Emergency or round-the-clock wording'),
    'insured': ('of_sites_read.licensed_claim', 'A licensed and insured claim'),
    'licence': ('of_sites_read.license_number', 'A printed licence number'),
    'warranty': ('of_sites_read.warranty', 'Warranty or guarantee wording'),
    'booking': ('of_sites_read.online_booking', 'Booking or scheduling wording, links or tools'),
    'reviews': ('of_sites_read.reviews_shown', 'A review widget, star figure or review count'),
    'forms': ('of_sites_read.contact_form', 'A contact form in the fetched page'),
    'towns': ('towns_named_median', 'Middle count of survey towns named per homepage'),
    'size': ('html_kb_median', 'Middle homepage HTML size in KB, before other files'),
}

PAGES = [
    dict(slug='garage-door-company', source='garage-door-companies',
         title='Garage door websites in West Michigan: calls, repairs and replacement',
         description='A dated look at West Michigan garage door homepages, from phone links to emergency wording, with a practical plan for repair and replacement pages.',
         intro='A stuck garage door and a planned door replacement send people looking for different answers. This read separates a way to call from a promise about when help arrives.',
         quick=[
             'A homeowner comparing garage door companies will usually find a way to call: [[calls]] of the [[read]] homepages read have a tap-to-call link. Emergency or round-the-clock wording appears on [[urgent]] of those [[read]] sites. That makes the phone a useful starting point, but the wording alone does not tell a caller when a repair visit is available.',
             'Warranty language is as common as emergency language in this sample. A new door buyer needs to know what is covered; a person with a door stuck shut needs to know whether you handle that repair. Give those visitors clear paths before asking either to book.',
             'Put repair contact details beside an honest description of your response hours. Then explain replacement choices, the visit needed for a quote and who handles later problems. The table below records what was found, without treating an advertised promise as proof of service.'
         ],
         sections=[
             ('A call button should lead to the right conversation',
              'The phone-link count is much higher than the count for contact forms. For a garage door owner, that difference matters when the car is inside and the door will not move. Keep the repair number easy to find above pictures of new doors. Say whether the person answering can arrange repair work or only pass along a message. If your office hours differ from repair hours, show both in words that leave no doubt. Do not label a general enquiry button as urgent help unless someone handles it that way. The survey found wording, not an answered phone, so it cannot certify any company’s response time.',
              'For a replacement enquiry, a short form may be useful instead. Ask for the town and whether the owner wants a door, an opener or help deciding. Let them describe the opening without requiring them to choose a spring or track part. The homeowner should not have to diagnose a door before you will talk to them.'),
             ('Keep a repair request apart from a door quote',
              'Scheduling language appears less often than tap-to-call links. That does not mean the remaining garage door firms lack appointments. The check can match a sentence about scheduling, and it can miss a calendar added by JavaScript. Treat the table as a guide to what a visitor can read at first load. If your button only requests a call back, call it a repair request. If it reserves a real visit, explain how the visit is confirmed. A replacement consultation should not look like a booked repair slot.',
              'Describe the door problems you actually take on, such as an opener that will not respond or a door that will not close. These are suggested subjects for your site, not things this survey counted. Leave repair instructions to the technician. A homeowner comparing businesses needs a clear route to help, not a test of their mechanical knowledge.'),
             ('Explain which promise belongs to which part',
              'The warranty count is broader than a count of written garage door warranties. The tool also finds the word guarantee, including in a disclaimer. It does not read the full terms. A replacement page can do better by separating the door maker’s cover from the installer’s work and any cover for the opener. State who the owner contacts if the door needs attention after fitting. Keep exclusions near the promise so a reader can understand both together.',
              'The money count cannot be used as a count of repair prices. An amount could describe a discount or a finance offer. Before adding an offer to your homepage, explain how you work out a repair quote and whether an assessment has a charge. Do not imply that a small advertised amount buys a complete replacement when it only reduces the bill.'),
             ('Name the places you will send a repair visit',
              'The town table shows how often garage door listings repeat across the region. A familiar name in several searches is still counted once here. That overlap is a reason to keep service coverage clear, not evidence that every listed firm visits every town. Name the places you actually travel to for repairs and say if replacement work has a different area. A reader in Holland should not have to infer coverage from a Grand Rapids office address.',
              'Start a site review with a phone in your hand. Follow the repair path, then the replacement path. Check that each ends with the right contact choice and a plain explanation of what happens next. Add a short answer about warranty cover only after those paths work. This order follows the gap between easy calling and less visible enquiry tools; it makes no promise about search position or new work.')
         ],
         limit='This read does not count door brands, opener brands, spring repairs or installation galleries. Those need a separate review. A phone-screen setting also does not prove that the repair button is easy to use.',
         faq=[
             ('Can a garage door site’s emergency wording prove a repair visit is available tonight?', 'No. [[urgent]] of [[read]] readable garage door homepages matched that wording. It could describe the service without stating the hours for your town. Confirm availability with the company before treating the wording as a booked visit.'),
             ('Does a garage door booking button mean I have reserved a technician?', 'The saved check found scheduling language or tools on [[booking]] of [[read]] garage door sites. It cannot tell whether the next screen offers a time slot. For a stuck door, ask how the request is confirmed and who will contact you.'),
             ('How many garage door homepages give a warranty clue before I ask for a replacement quote?', 'Warranty or guarantee language was found on [[warranty]] of [[read]] garage door homepages. That is a prompt to request the terms for the door, opener and fitting work. It is not a finding that all of those parts have cover.')]),
    dict(slug='concrete-contractor', source='concrete-contractors',
         title='Concrete contractor websites in West Michigan: getting from a driveway idea to a quote',
         description='Measured concrete contractor homepages in West Michigan: phone links, quote wording and sparse FAQs, with a plan for explaining a driveway or patio job.',
         intro='A driveway quote needs more context than a picture of finished concrete. The question here is how much help a homeowner gets before the site visit.',
         quick=[
             'A homeowner planning concrete work will find phone links more often than written answers. [[calls]] of the [[read]] concrete contractor homepages read have a tap-to-call link. Only [[faqs]] of the [[read]] have an FAQ heading or FAQ markup. It is easier to start a call than to find a question-and-answer section in this sample.',
             'Free quote or assessment wording is more common than a contact form. Neither tells us whether a driveway enquiry asks about removal, access or the area to be poured. A concrete site can help by explaining what the contractor needs to see before giving a useful quote.',
             'Lead with the kind of work you take on, then show how a homeowner can describe the project. Explain the visit and what the written quote covers. Use completed driveway and patio examples you can support with your own work, without suggesting that this survey measured project quality.'
         ],
         sections=[
             ('Help a homeowner describe the pour',
              'Phone links are much more common than scheduling language on these concrete sites. A planned patio does not always need an immediate conversation, though. Someone collecting ideas may want to explain where it will sit and whether old material needs removing. Offer a project enquiry with room for those details, and keep the phone link for people who prefer to talk. Make clear whether you handle new surfaces, replacement work or both. A person with a damaged driveway should not need to guess whether the pictured patio business also removes old concrete.',
              'If you accept photographs, explain what views help you decide whether to visit. A wide view of access and the area around the job may be more useful than a close crop of a crack. This is a suggested enquiry design, not a feature count from the saved homepages. Let a visitor send what they know without forcing a final material choice.'),
             ('A free quote needs a clear boundary',
              'The free-estimate measure includes free quotes, inspections and consultations. It does not show that all of those offers mean the same thing. For concrete work, say whether the visit includes measuring, discussion of the finish and a written description of the work. If removal, disposal or preparation may change the quote, name those issues before the owner compares a total. The homeowner needs to compare the proposed work as well as the amount.',
              'Very few concrete homepages in this read contain an amount of money. The tool does not establish whether those amounts are prices, discounts or finance offers. There is no basis here for a typical driveway price. You can still explain why access, the existing surface and the planned shape need a closer look. Use your own checked charges if you publish them, and state what they cover.'),
             ('Turn the small FAQ count into useful preparation',
              'The rare FAQ heading leaves a useful place for a concrete business to write with care. Before the visit, an owner may wonder what happens to the old slab, where equipment reaches the area and when they can use the finished surface. Explain your process for those questions. Do not publish a universal wait time if it depends on the actual job. Tell the owner when you will give instructions for their pour and who can answer a later question.',
              'Separate preparation from finish choices. A page showing stamped or smooth work should explain which jobs you offer rather than just display a wall of pictures. The sweep did not count finish descriptions or photos. Its narrow FAQ result tells us about a way of presenting answers, not whether useful answers exist elsewhere on a contractor’s site.'),
             ('Make the project examples and coverage agree',
              'The listings cover every survey town, but repeat businesses reduce the regional business total. Do not add the town homepage totals together to claim a larger set of concrete contractors. For an owner, the practical point is to check whether the contractor serves the address where the work will happen. For the business, put the actual travel area beside the enquiry route. A project photo from a nearby place can illustrate work you did; it should not imply that you accept jobs throughout the region.',
              'Build the homepage around the job types you want people to ask about. Put driveway replacement, patio work and any other work you actually offer in plain language, with a path to details. Then check the enquiry on a phone and read the quote explanation without the photos. If it still tells a homeowner what to send and what comes next, it has a useful foundation. This survey cannot show whether that change wins work.')
         ],
         limit='No count here covers concrete finishes, reinforcement, drainage design, removal or how long a pour lasts. The measurements cannot judge workmanship or tell whether a crack needs replacement.',
         faq=[
             ('Will a concrete contractor homepage usually answer questions about preparing for a driveway pour?', 'Only [[faqs]] of [[read]] readable concrete sites had an FAQ heading or FAQ markup. Preparation advice may still be on a different page. Ask where to find the contractor’s instructions for access, removal and use after the pour.'),
             ('Can I assume a concrete company’s free estimate includes a written driveway scope?', 'No. Free estimate, quote or assessment language appeared on [[estimate]] of [[read]] concrete homepages. The read did not inspect the resulting quote. Ask whether removal, preparation and the proposed finish will be set out in writing.'),
             ('How common is a web form for sending a concrete patio enquiry?', 'A contact form was visible in the fetched HTML on [[forms]] of [[read]] concrete sites. A photo-upload option was not counted. If the form does not let you explain access or an existing slab, use it to ask how to send those details.')]),
    dict(slug='fence-company', source='fence-companies',
         title='Fence company websites in West Michigan: quote visits, gates and warranty wording',
         description='A West Michigan fence homepage survey measuring free quote wording, calls and guarantees, with advice for explaining boundaries, materials and gate needs.',
         intro='A fence buyer is choosing an enclosure, its gates and the person who will put it in. A useful homepage helps them prepare for a quote without pretending the boundary is already settled.',
         quick=[
             'Someone comparing fence companies will often find an invitation to ask for a free quote or assessment. That wording appears on [[estimate]] of the [[read]] fence homepages read. Warranty or guarantee wording appears on [[warranty]] of those [[read]] sites. Neither count tells the buyer what a fence quote includes or which parts a guarantee covers.',
             'Calling is more common than using a contact form in this sample. Help the person who is still deciding by explaining fence choices and the visit before pushing them toward a booking button. They may know they want privacy but not yet know the gate width or the run of the fence.',
             'For a fence business, start with the purpose of the enclosure and the materials you actually fit. Show how to request a visit, what information to prepare and where warranty terms can be read. Keep boundary questions separate from a promise to install.'
         ],
         sections=[
             ('Ask what the enclosure needs to do',
              'Free-estimate wording is common enough that simply putting it in a large banner gives a buyer little help comparing fence work. Explain what happens after the request. Will someone discuss the purpose of the fence before measuring? How should the owner show the intended route? Ask whether privacy, a pet enclosure or another use is behind the enquiry. Those answers help you describe a suitable visit without asking the homeowner to design the fence themselves.',
              'A material gallery can be useful when it is tied to work you actually offer. Put names beside wood, vinyl, metal or other choices you install. Explain how the gate is discussed as part of the project. This survey did not count materials or gate options, so those suggestions are about making a quote easier to discuss. They are not claims that local fence companies leave those subjects out.'),
             ('Give the gate as much thought as the fence run',
              'A tap-to-call link appears more often than a form on the fence homepages read. On the phone or online, give the owner a way to explain how they use the entrance. Walking access, moving garden equipment and getting a vehicle through are different requests. Say what you will check at the visit instead of asking for a final gate specification before you have seen the space. A short description of the planned opening is a reasonable start.',
              'Keep location and boundary information clear. Invite the owner to describe the intended route, and say how your business handles questions that must be settled before installation. Do not present a fence quote as proof of a property line. Nothing in the homepage read verifies a boundary, an approval or a company’s authority to decide either. Your website should describe your process without making that leap.'),
             ('Say who stands behind the fence after fitting',
              'Warranty language is much more common than an FAQ section in this fence sample. That is a reason to explain the promise where the buyer first sees it. If material cover comes from a maker and fitting cover comes from your business, describe the difference. Tell the owner how to raise a concern about a gate that is not closing as expected. Do not make the person search a footer to learn whose promise the large headline refers to.',
              'The count includes guarantee wording and can include a disclaimer. It does not show how broad the cover is. A helpful explanation gives the owner a route to the full terms before accepting a quote. If maintenance affects cover, explain the care advice you provide at handover. Write only the terms you actually offer rather than borrowing a promise from another fence company’s page.'),
             ('A regional search is not a service-area promise',
              'Every town returned fence listings, but several returned fewer than the search limit. Businesses also appear in several towns, which is why the regional total is smaller than the raw listing total. The town table records the uneven search coverage. It cannot show the number of fence installers based in each place. An owner should confirm travel to the job address; a fence company should make its own travel area easy to find.',
              'There is little visible FAQ material in this read. Use that space for questions a fence buyer asks before a visit: what to prepare, how gates are included and how the quote is confirmed. Keep answers near examples of relevant enclosures. The best first edit is an explanation that reduces uncertainty about your process. The survey measures homepage content and cannot predict whether that edit changes enquiries or search placement.')
         ],
         limit='Fence height, material types, property lines, gate widths and installation standards were not measured. The sweep cannot tell whether an enclosure is suitable for a particular home or pet.',
         faq=[
             ('Does a free fence estimate usually tell me what happens at the measuring visit?', 'The offer was detected on [[estimate]] of [[read]] fence homepages, but the visit itself was not reviewed. Ask what the installer needs from you about the route and gates before arranging a time.'),
             ('Can a fence homepage guarantee be treated as cover for both panels and gates?', 'Warranty or guarantee wording appeared on [[warranty]] of [[read]] fence sites. The wording check does not identify covered parts. Request the terms for your chosen material, gate hardware and installation work.'),
             ('Are fence questions commonly collected in a homepage FAQ?', 'An FAQ heading or FAQ markup appeared on [[faqs]] of [[read]] readable fence sites. That leaves many sites where you may need to ask directly how the company handles preparation for a quote and later care.')]),
    dict(slug='pest-control-company', source='pest-control-companies',
         title='Pest control websites in West Michigan: calling, treatment questions and return visits',
         description='A dated survey of West Michigan pest control homepages, looking at calls, guarantee wording and treatment questions without judging individual businesses.',
         intro='A homeowner may know where a pest appeared without knowing what it is. A pest control homepage needs to make that uncertainty easy to explain.',
         quick=[
             'Pest control comparisons usually start with an easy call: [[calls]] of the [[read]] readable homepages have a tap-to-call link. Warranty or guarantee wording appears on [[warranty]] of the [[read]]. A phone link helps report the problem; the promise needs more reading before it can explain what happens if pests return.',
             'Review displays are less common than guarantee wording. That does not measure the quality of pest work or the number of reviews elsewhere. It means the first fetched page often gives a promise without a visible review count, star figure or recognised review display.',
             'Make the first contact useful for someone who cannot identify the pest. Ask where they noticed it, explain the assessment and describe any return-visit terms you really offer. Give preparation instructions through the right treatment process rather than suggesting a general homepage can replace them.'
         ],
         sections=[
             ('Let the owner report what they saw',
              'A pest enquiry should not depend on choosing the correct species from a menu. Tell the owner how to describe the signs they noticed and where they noticed them. If your process accepts a picture, explain how to send it without promising that a picture settles the problem. The high phone-link count suggests a familiar route to this first conversation. Put the number beside words that say what information helps you decide the next step.',
              'Keep the pests you actually treat visible in ordinary language. Someone asking about insects inside a kitchen may need a different route from someone asking about activity in a roof space. The saved sweep did not count pest names or treatment types. Do not read the common homepage measures as proof that a firm handles a particular pest. A useful service page states the work offered and the limits of an initial assessment.'),
             ('A guarantee should explain the return visit',
              'The warranty measure includes guarantee wording, so it is especially important to avoid turning it into a claim about successful treatment. For a pest buyer, the useful questions are what happens if the problem returns, how to report it and whether a further visit is included. Put those answers beside the offer, with a route to the full terms. If cover depends on the treatment chosen, make that dependency clear before the homeowner agrees.',
              'A homepage promise cannot tell us whether a treatment was carried out well. Nor does a low review-display count mean people did not review the business elsewhere. Show feedback you have permission to use and explain the service it concerns. Keep it apart from claims about future results. This measurement counts visible wording and recognisable review displays, not the experience of a household after a visit.'),
             ('Distinguish a request from a treatment appointment',
              'Booking language is less common than contact forms in this pest control read. Even where it appears, a scheduling phrase can be matched in page code rather than on a working calendar. A homeowner should know whether they are asking for a call, arranging an assessment or choosing a treatment visit. Label each step plainly. Do not say treatment is booked when the team still needs to learn what the problem might be.',
              'The emergency count also needs care. The word may be on a page without stating availability for the pest or the owner’s address. Explain your response hours and what the first contact can arrange. Keep treatment preparation and advice about the home tied to the actual visit. This article does not supply treatment or safety instructions, and the sweep cannot verify them.'),
             ('Make the cost conversation about the service',
              'Some pest homepages include an amount of money, while no readable homepage matched the financing check. Neither finding gives a treatment price. An amount could be an offer rather than a charge for the work the owner needs. Explain whether the enquiry is about an initial visit, later checks or an ongoing plan, if you offer those choices. A reader should be able to understand the service before comparing the amount.',
              'Pest listings repeat across towns, so apparent choice in separate searches can include the same provider. State the places you visit and how a homeowner confirms coverage. Then add an answer about return visits and the next step after a pest report. These edits follow the observed difference between readily available calling and less visible written explanations. They do not establish demand for pest work or promise better rankings.')
         ],
         limit='The collector did not classify pests, read treatment plans or check product use. Licence wording is a text finding, not a verified licence or a legal assessment.',
         faq=[
             ('Does pest control guarantee wording show that a return treatment is free?', 'No. [[warranty]] of [[read]] pest homepages matched warranty or guarantee wording. That does not settle return-visit charges or conditions. Ask for the terms that apply to the pest and service being quoted.'),
             ('How often does a pest homepage give me a place to send a written description?', 'A contact form was found on [[forms]] of [[read]] readable pest sites. The check did not test whether a photo can be attached. You can ask how to send a description if the pest has not been identified.'),
             ('Can a pest company FAQ answer treatment questions before I call?', 'An FAQ heading or FAQ markup was found on [[faqs]] of [[read]] pest control homepages. The tool did not judge those answers. Use any available explanation to prepare questions about assessment, preparation and follow-up for your home.')]),
    dict(slug='tree-service', source='tree-services',
         title='Tree service websites in West Michigan: urgent calls and planned tree work',
         description='West Michigan tree service homepages measured for emergency wording, phone links and estimates, with a clear distinction between storm calls and planned work.',
         intro='A fallen limb and a planned tree removal are different conversations. The homepage read shows how often local tree sites open the urgent route and what else an owner needs to know.',
         quick=[
             'A homeowner looking through tree service sites will often see urgent-help wording. [[urgent]] of the [[read]] homepages read mention emergencies or round-the-clock service. A tap-to-call link appears on [[calls]] of the [[read]]. These are ways to start a conversation, not checks that a crew is available or that a damaged tree is safe.',
             'Free estimate language is more common than contact forms in this sample. Someone planning pruning or removal should be able to explain the job without using the urgent route. Someone reporting storm damage needs clear contact hours and a useful next step.',
             'Keep those routes apart on your tree website. Describe the work you take on, the visit used to assess it and how the owner learns what is included in cleanup. Avoid a promise about a tree’s condition before it has been assessed.'
         ],
         sections=[
             ('Urgent wording needs an honest contact path',
              'Emergency wording appears more often than scheduling language in the tree service sample. For an owner dealing with damage, a vague schedule button is a poor substitute for knowing how to reach the business. Place the right number beside the hours it is monitored. State how the caller learns whether someone can attend. Do not let a general enquiry form look like a confirmed urgent response.',
              'The check only reads homepage text and code. It cannot tell whether emergency wording concerns storm work, whether a call is answered or whether a crew can reach the address. Keep those limits in mind when comparing sites. For a business, the useful edit is a precise explanation of your own contact process. A large urgent-service headline should not ask the reader to fill in missing hours or guess who receives the message.'),
             ('Give planned pruning its own space',
              'An owner considering work on a standing tree may want to discuss its position, nearby structures and what they hope to change. A planned-work enquiry can gather that context without treating it as a diagnosis. Explain how you arrange an assessment and when the owner will receive a description of the proposed work. The free-estimate wording count does not tell us whether those details are included in an offer.',
              'Name the kinds of tree work you actually provide. If pruning, removal and stump work are separate services in your business, make the distinction easy to read. A photograph of a cleared garden does not tell the owner whether stump work was part of the job. The saved measurements did not classify tree tasks or project photos. These are choices for a clearer site, not findings about which services local firms offer.'),
             ('Describe the finished job, including what leaves the site',
              'A useful tree quote explains what the homeowner is agreeing to have done. Tell them how your business discusses cut material, access and cleanup before work starts. If stump work is quoted separately, say that clearly where the removal service is described. Do not wait until the contact form to reveal a difference that changes the owner’s idea of the finished garden.',
              'Review displays and warranty wording are both much less common than free estimate language in this read. That does not make tree work without a homepage review display less trustworthy. It means those particular cues were not often found at first load. Use genuine examples to explain a job you carried out, and keep any promise about the work specific. Do not offer a blanket assurance about living trees based on a website checklist.'),
             ('Coverage should describe where the crew travels',
              'All the survey towns returned tree listings, with businesses repeating across searches. The regional table removes that repetition. A name appearing for several towns does not establish where a crew is based or how quickly it travels. Show the area your business actually serves and explain how you confirm a visit to an address near its edge. Keep storm-call coverage distinct if it differs from planned work.',
              'Begin a homepage review with the urgent route because that wording is prominent in this sample. Then follow a planned pruning enquiry from the service description to the assessment request. Both should end with a clear explanation of the next contact. Add answers about cleanup and stump work where they belong in your process. This is a way to improve clarity for a tree owner; the read does not measure bookings, tree health or search performance.')
         ],
         limit='No tree condition, climbing qualification, insurance policy, cleanup standard or response time was checked. An urgent-service phrase must not be read as an assessment of a hazardous tree.',
         faq=[
             ('How much emergency language did the tree service read actually find?', 'It matched on [[urgent]] of [[read]] readable tree homepages. That is a count of wording available to an owner reporting damage. It does not show who can attend a particular storm call.'),
             ('Can I send details for planned pruning without calling a tree firm?', 'The fetched pages contained a contact form on [[forms]] of [[read]] tree sites. Other sites may provide email or a later enquiry page. Ask how to describe access and the proposed work before arranging an assessment.'),
             ('Does a free tree estimate tell me whether stump work is included?', 'Free estimate or assessment wording appeared on [[estimate]] of [[read]] tree homepages. Stump work was not counted. Make its inclusion or exclusion part of the written scope before comparing removal quotes.')]),
    dict(slug='gutter-company', source='gutter-companies',
         title='Gutter company websites in West Michigan: estimates, cover and the water’s route',
         description='A measured read of West Michigan gutter homepages, from free estimates and warranty wording to explaining repairs, replacement and downspouts.',
         intro='A homeowner wants to know where the water will go, not just what a new gutter looks like. This read looks at the first steps gutter websites make visible.',
         quick=[
             'A person comparing gutter companies will often find free estimate or assessment wording: [[estimate]] of the [[read]] readable homepages have it. Warranty or guarantee language appears on [[warranty]] of the [[read]]. The offer to visit is common; explaining what will be inspected and what the promise covers is the next job.',
             'Contact forms appear more often than scheduling language in this gutter sample. That fits a request for a quote better than an assumption that an installation time is already booked. A homeowner with an overflowing gutter needs to know whether to ask about cleaning, repair or replacement.',
             'Use your homepage to explain the work you offer and the route to an assessment. Show how you discuss downspouts and the destination of the water. Put the terms for materials and fitting work near any warranty headline, without claiming that a word on a site proves the cover.'
         ],
         sections=[
             ('Give overflow enquiries a useful starting point',
              'The tap-to-call count is close to the free-estimate count on these gutter homepages. Both are useful, but neither identifies the work the owner needs. A visitor may be describing a leak at a joint, overflow during rain or a wish to replace a damaged run. Give them room to describe the problem in their own words. If cleaning and installation are different parts of your business, say so before the enquiry is sent.',
              'Avoid asking the owner to choose replacement before someone has looked at the gutter. Explain how you decide the next step in your own process. A photo can help describe a problem if you accept one, but it should not be presented as a complete inspection. The sweep did not count cleaning offers or diagnose overflow. Its findings concern the homepage route into that conversation.'),
             ('Explain the downspout as part of the plan',
              'Gutter pictures often focus attention on the roof edge. For a quote request, the owner also needs a way to discuss downspouts and where the water is intended to leave them. State what you review during the visit and how changes are set out in the proposed work. Do not imply that a new gutter alone resolves every water problem around a house.',
              'A service description can separate repair, full replacement and any guard work you actually offer. Explain whether a guard enquiry includes a look at the existing gutter or starts with a different assessment. None of those trade tasks was measured by the common homepage check. Writing about them gives your own offer useful detail without claiming that the local sample lacks it. Keep photographs tied to projects you can identify and describe accurately.'),
             ('A warranty headline needs its terms nearby',
              'Warranty wording appears more often than review displays in this gutter sample. The collector cannot tell whether it refers to the gutter material, fitting work, guards or a broad statement in a footer. It also matches guarantee language in disclaimers. Treat the count as a reason to ask about cover, not a count of equivalent promises. A business can improve that comparison by naming what its own promise applies to.',
              'Give the owner a route to the complete terms and the contact for a later concern. If cleaning or care affects cover, explain what instructions you provide. Separate maker cover from work your business stands behind. Keep finance or discount language away from claims that it somehow extends a warranty. The amount-of-money measure does not establish installation prices, and the finance count does not show whether a visitor qualifies for anything.'),
             ('Make a quote request feel complete',
              'The contact-form count is much higher than the scheduling count here. Use the form to collect the town, the type of gutter concern and a way to reply. Tell the owner what happens after sending it. If it only asks for a call back, do not label it as a booked installation. Keep a phone choice nearby for someone who cannot use the form.',
              'The town table includes places where Brave returned fewer than its search limit. That is search coverage, not a measure of how many gutter firms work there. Repeated businesses are counted once regionally. State your actual travel area rather than relying on the search listing to imply it. Review the enquiry flow with a simple overflow question and a planned replacement question. A clear answer to both is a useful improvement; this measurement does not predict additional work or ranking changes.')
         ],
         limit='The sweep did not measure gutter materials, guards, cleaning, pitch, downspout placement or drainage performance. Those require a separate review of the work and the property.',
         faq=[
             ('Does a gutter free-estimate offer tell me whether cleaning or replacement is needed?', 'Free estimate or assessment wording was found on [[estimate]] of [[read]] gutter homepages. It does not diagnose overflow. Describe the problem and ask what the visit will assess before choosing a scope.'),
             ('How often can a gutter quote request start in a homepage form?', 'A form was present in the fetched page on [[forms]] of [[read]] gutter sites. The read did not submit it or check reply times. Treat sending it as an enquiry unless the business confirms a visit.'),
             ('Does gutter guarantee wording identify cover for guards and downspouts?', 'The wording appeared on [[warranty]] of [[read]] gutter homepages. Covered parts were not classified. Ask for the terms for the exact gutter, guard and fitting work in your proposed job.')]),
    dict(slug='siding-contractor', source='siding-contractors',
         title='Siding contractor websites in West Michigan: estimates, finance and the wall beneath',
         description='A West Michigan siding homepage measurement looking at estimate wording, finance and contact routes, with practical advice for explaining replacement work.',
         intro='A siding buyer can compare colours in a picture. Comparing the work needs an explanation of removal, the wall underneath and what the installer will quote.',
         quick=[
             'A homeowner comparing siding contractors will often see an invitation to a free estimate or assessment. It appears on [[estimate]] of the [[read]] homepages read. Financing language appears on [[finance]] of the [[read]]. The estimate is more common, but neither offer explains the scope of replacing the siding.',
             'Warranty wording and contact forms appear equally often in this sample. That gives a siding business a useful place to connect the promise with the enquiry: explain what the visit covers, then let the owner ask about the material and the fitting work.',
             'Write the replacement process before writing a finance headline. Say how your team deals with questions about the existing cladding, trim and any work that becomes clear after removal. Do not turn an advertised payment option into an assumed project price.'
         ],
         sections=[
             ('Start with the replacement scope',
              'A free-estimate invitation is common on these siding homepages. The useful difference for a buyer is what the contractor means by an estimate. Explain whether the visit includes looking at the existing cladding and discussing the trim, openings and proposed finish. State how the written quote describes removal and the new work. A homeowner should not have to infer those details from a colour sample or a photograph of a completed elevation.',
              'If parts of the wall cannot be assessed until material is removed, explain how your business discusses that uncertainty and any later decision. This is a suggested topic for the quote process, not a claim about damage at a particular home. The survey read only homepages. It cannot inspect a wall, determine a repair or decide whether replacement is the right choice.'),
             ('Make finance understandable after the work is defined',
              'Financing language is far more common than a homepage FAQ in the siding sample. That can put a payment conversation in front of basic questions about the job. Keep the scope easy to read before presenting ways to pay. Show where the owner can learn the terms of any offer you actually provide. Do not suggest that the appearance of financing language means approval is available for everyone.',
              'An amount of money on a siding homepage is not necessarily a full project price. The measurement may detect a discount or an offer attached to another service. There is no typical siding cost in this dataset. If you publish a checked example from your own work, explain what was included and what would make a different house a different quote. Avoid presenting the monthly amount as a substitute for the scope and full terms.'),
             ('Keep the material promise apart from fitting work',
              'Warranty wording is common enough to deserve a clear explanation. It may refer to the siding product, the installer’s work or a general guarantee. The collector does not distinguish those uses and can match disclaimers. Name the party behind each promise and link to the full terms you supply. The owner should know whom to contact about a concern after the job.',
              'A project example can show how your team finished around a window, corner or roof edge, if it is your work and you describe it accurately. The read did not count detail photos or siding materials. Use those examples to explain the offer, not to imply the measured sites omit them. A gallery is most helpful when the caption says what the job involved rather than only naming a colour.'),
             ('Use the enquiry to arrange an informed visit',
              'Contact forms appear much more often than scheduling language on the siding sites read. A short request can ask for the town, which sides of the home are being considered and the best way to reply. Make room for an owner who is deciding between a repair and larger replacement. Tell them whether the next step is a call or a visit, rather than making the form look like a booked installation date.',
              'The regional list contains many repeat appearances across towns. Count a business once when thinking about the sample, and do not treat the town totals as separate markets to add together. For your site, show the places you serve for siding work and make that coverage easy to find beside the enquiry. Then read the page as an owner who knows the desired look but not the construction details. This is a clarity check, not a forecast of leads or rankings.')
         ],
         limit='There are no measurements of siding materials, wall condition, weather barriers, trim detail or installation quality. Common homepage wording cannot answer those construction questions.',
         faq=[
             ('Does siding finance language tell me what replacing the cladding will cost?', 'Financing was mentioned on [[finance]] of [[read]] siding homepages. The check did not collect comparable project totals or finance terms. Get the proposed work and the full offer before comparing payment options.'),
             ('Can a siding enquiry form arrange a visit to discuss removal and trim?', 'A contact form appeared on [[forms]] of [[read]] readable siding sites. The check did not test what details it asks for. Use the enquiry to request a scope discussion rather than assuming those parts are included.'),
             ('Are siding warranties as visible as the invitation to a free quote?', 'Warranty or guarantee wording was found on [[warranty]] of [[read]] siding homepages. The table shows the separate quote-offer count. A visible promise still needs terms that distinguish the material from fitting work.')]),
    dict(slug='window-replacement-company', source='window-replacement-companies',
         title='Window replacement websites in West Michigan: quotes, fitting and warranty questions',
         description='Measured West Michigan window replacement homepages, including phone links, warranties and estimates, with advice for a clearer fitting enquiry.',
         intro='A window buyer needs to compare more than the shape of the frame. A useful enquiry explains what will be measured, fitted and covered after the work.',
         quick=[
             'Homeowners comparing window replacement companies will usually find a phone link. [[calls]] of the [[read]] readable homepages have one. Warranty or guarantee wording appears on [[warranty]] of the [[read]]. Calling is easy to find, but the cover still needs to be read for the window and the fitting work separately.',
             'Free assessment language appears more often than financing language. Contact forms are also more common than scheduling wording. Those findings favour a clear request for a measuring visit over a button that makes the owner think the whole replacement is booked.',
             'Describe the windows you replace, how you assess the existing opening and how the written quote defines the fitting work. Let someone who wants advice ask for it without already knowing a frame specification. Avoid promising savings or performance that this homepage survey did not measure.'
         ],
         sections=[
             ('Make measuring the next clear step',
              'The strong phone-link count is useful for an owner who wants to ask whether a company handles the kind of replacement they have in mind. The site should make that question easier before the call. Describe the work you accept and the information that helps arrange a visit. An owner can say which rooms are involved and what they are unhappy with without choosing a final window product.',
              'Explain how the opening and existing frame are assessed in your own quoting process. If the fitting approach is discussed after that assessment, say when the buyer will learn the recommendation. A gallery of new windows cannot explain that decision by itself. The sweep did not count fitting methods or frame materials. Those subjects belong in your service description because they help the buyer understand your offer, not because the data proves competitors leave them out.'),
             ('Describe the fitting as well as the product',
              'A replacement quote should give the owner a clear idea of the finished work. On your site, explain how you discuss removal, finishing around the opening and cleanup if those form part of the service. Keep product details tied to what the business actually supplies. Someone comparing windows needs to know what to ask about the installation as well as the appearance of the frame.',
              'The free-estimate check includes quotes, inspections and consultations. It cannot establish that a visit includes measuring or a written specification. Spell that out for your own visit. If the owner needs to prepare information or access before you arrive, state how you will tell them. Do not imply that an online request has settled the window sizes, materials or installation scope.'),
             ('Read the warranty in separate parts',
              'Warranty wording is much more common than an FAQ section in this window sample. A buyer may see the promise early but still need to ask who handles a later fault. Separate the window maker’s terms from any cover for fitting work. State where the complete terms can be read and which business the owner contacts. If different parts have different cover, explain that without hiding the distinction in a slogan.',
              'This count includes guarantee wording and can match a disclaimer. It is not a comparison of warranty length or strength. Review displays were also counted, but the read does not verify the feedback or link it to a particular product. Use a documented replacement example to explain your work, and keep any claim about performance within what you can support for that job.'),
             ('Do not let the payment offer replace the quote',
              'Financing appears on some window homepages, and visible money amounts appear less often. Neither gives us a typical replacement price. A printed amount could be a discount, a payment offer or something unrelated to the complete fitting job. Put the work being quoted first. If you offer finance, give the buyer a route to its terms and avoid implying that the homepage establishes eligibility.',
              'Businesses repeat across all the towns in this survey. The table counts them once regionally, while the town list shows what the searches returned. A window company should still say where it sends a measuring visit. Make that coverage visible beside the enquiry route, then check that an owner can ask about a partial replacement as easily as a larger project. The survey supports a review of those contact choices; it does not measure energy savings, completed sales or search position.')
         ],
         limit='No frame materials, glass specifications, fitting methods, energy ratings or savings were measured. The homepage read cannot establish whether a window needs replacing.',
         faq=[
             ('Does window warranty wording cover the fitting as well as the frame?', 'Warranty or guarantee wording appeared on [[warranty]] of [[read]] window replacement homepages. Its scope was not classified. Ask for the separate product and installation terms for the windows in your quote.'),
             ('Will a free window assessment necessarily include measuring the openings?', 'The broad free-offer wording matched on [[estimate]] of [[read]] readable window sites. The visit was not observed. Confirm whether measuring and a written fitting scope are part of the appointment you request.'),
             ('Can I treat a window scheduling button as a confirmed measuring appointment?', 'Scheduling language or tools were detected on [[booking]] of [[read]] window sites. A matched phrase may only start an enquiry. Check how the company confirms the visit before planning to be home.')]),
    dict(slug='flooring-company', source='flooring-companies',
         title='Flooring company websites in West Michigan: finance, measuring and installation scope',
         description='A read of West Michigan flooring homepages measuring estimates, finance and enquiry routes, with practical advice for a room-by-room fitting quote.',
         intro='Choosing a floor and arranging its fitting are linked decisions. A homepage should help a homeowner understand which part of that process the business offers.',
         quick=[
             'A homeowner comparing flooring companies will see finance wording almost as often as free quote or assessment wording. Financing appears on [[finance]] of the [[read]] homepages read; free-offer wording appears on [[estimate]] of the [[read]]. Neither tells the buyer whether a quote includes fitting, removal or preparation.',
             'Phone links are more common than either offer, and contact forms appear more often than scheduling language. A flooring enquiry should give room to explain the rooms and the existing floor before the owner is asked to select a product.',
             'State whether you sell flooring, fit it or do both. Explain the measuring visit and how the work around the new surface is quoted. Put the full job ahead of the payment offer, without using a coupon or a monthly amount as a claim about the total.'
         ],
         sections=[
             ('Separate choosing the surface from quoting the fitting',
              'The flooring sample has almost as much finance language as free-assessment language. That makes the order of information important. A buyer first needs to know whether the business will supply the floor, install it or help with both. Say how product choice and measuring fit together in your process. Someone browsing carpet or hard flooring may want advice before they know enough to ask for a final quote.',
              'Use service descriptions that match what you actually do. If you offer visits with samples, explain how to request one. If the process begins in a showroom, state that clearly. The sweep did not classify flooring materials, retail-only businesses or installation-only services. A regional count of common homepage features cannot answer those distinctions for an individual company. Your own site can answer them directly without making the visitor guess from a product grid.'),
             ('Show what happens to the old floor',
              'A finished-room photo shows the surface but may say little about the work underneath. Explain how you discuss removing the old covering, preparing the base and finishing at doorways. If any of those are quoted separately, make the difference clear before a buyer compares totals. A homeowner should not discover late in the process that their idea of fitting includes work the quote did not cover.',
              'The money detector found very little visible monetary text in this flooring sample, despite the much more common finance wording. That does not mean there are no product prices elsewhere on the sites. Only homepages were fetched. There is no support here for a local price per room or area. Use your own checked costs and scope if you publish an example, rather than turning this survey into a price guide.'),
             ('Make measuring easy to arrange',
              'The contact-form count is higher than the scheduling count. That gives a flooring business a useful place to gather an initial room list and the owner’s town. Let the person say they are unsure about the surface they want. Explain whether the next step is a discussion, a showroom visit or measuring at home. If a calendar is shown later, say when the appointment becomes confirmed.',
              'Ask only for details that help the first reply. A visitor need not provide exact measurements to ask whether your business can help. State how you produce the measurements used for the quote. If moving furniture or access is discussed before fitting, tell the buyer when that conversation happens. These suggestions are about a clearer enquiry; the collector did not test the forms or inspect any measuring service.'),
             ('Explain care and cover for the chosen floor',
              'Review displays appear slightly more often than warranty wording on the flooring sites read. Neither is proof that a particular floor will suit a room. Use genuine feedback where you have permission, and explain the work it refers to. Then separate the product’s care instructions from your own promise about fitting. A large guarantee word should lead to terms the buyer can read before agreeing.',
              'The town searches all returned their first set of local listings, with businesses repeating between places. The regional total removes that overlap. A flooring company should still state whether it visits the owner’s address for measuring and fitting. Start a site review with the supply-and-fit distinction, then the measuring route, then preparation and care. That order responds to this sample’s prominent payment language. It makes no prediction about future sales or the performance of any flooring product.')
         ],
         limit='The saved read does not measure flooring types, stock, installation methods, room suitability or fitting quality. It cannot tell a buyer which material to choose.',
         faq=[
             ('Does flooring finance language mean fitting is included in the offer?', 'Financing was mentioned on [[finance]] of [[read]] flooring homepages. No finance terms or supply-and-fit scopes were compared. Ask whether the offer covers the product, installation and any preparation being quoted.'),
             ('How often can I start a flooring measuring enquiry with a web form?', 'The fetched HTML contained a contact form on [[forms]] of [[read]] flooring sites. That does not establish that a measuring visit can be booked there. Use the form to ask how the business arranges the next step.'),
             ('Will a flooring homepage FAQ explain old-floor removal before I visit a showroom?', 'An FAQ heading or FAQ markup appeared on [[faqs]] of [[read]] readable flooring homepages. Its answers were not graded. If removal is not explained, ask for that part of the scope before comparing a room quote.')]),
    dict(slug='house-cleaning-service', source='house-cleaning-services',
         title='House cleaning websites in West Michigan: booking, room lists and repeat visits',
         description='A measured read of West Michigan house cleaning homepages, including phone links, booking wording and forms, with advice for describing the clean.',
         intro='A regular clean, a deeper clean and a clean before moving are different requests. The website should help the homeowner explain which one they mean.',
         quick=[
             'Homeowners comparing house cleaning services will find calling easier to spot than sending a homepage form. [[calls]] of the [[read]] readable sites have a tap-to-call link. Only [[forms]] of the [[read]] contain a contact form in the fetched page. A booking prompt elsewhere may still lead to a separate form.',
             'Scheduling language appears more often than homepage forms in this cleaning sample. That is a useful invitation, but it does not prove that a cleaner or time slot has been reserved. A homeowner needs to know whether they are asking for a quote or confirming a visit.',
             'Describe the kind of clean, the rooms covered and how extras are agreed. Explain what changes between an initial visit and a repeat visit if your service makes that distinction. Keep access arrangements and confirmation steps clear before asking the owner to book.'
         ],
         sections=[
             ('Name the clean before asking for the booking',
              'A house cleaning enquiry can start with a simple description of the home and the reason for the clean. Give the owner a choice of the services you actually offer without making them decode package names. If regular cleaning, deeper work and move-related cleaning have different scopes, state that in ordinary words. A room list is useful only if the person can also understand what is done in those rooms.',
              'Scheduling language is more common than a contact form on the fetched homepages. A button can still lead to a separate request page or a tool added later. Tell the owner what it does. If someone must review the details before confirming availability, label the step as a request. Do not make a person arrange their day around a visit that has not yet been agreed.'),
             ('Make the task list readable',
              'Describe included tasks and explain how the owner asks about extras. A photograph of a tidy room cannot show whether the work includes an oven, the inside of a cupboard or another detail the owner has in mind. Use the actual scope of your service, and put exclusions close enough to read with the promise. The sweep did not count cleaning tasks or compare packages, so there is no measured local standard for what a clean includes.',
              'Free quote or assessment wording is more common than review displays in this sample. That is an opening to explain how the quote is worked out. Ask for the details you need and say when the owner receives the scope. If the first visit differs from later cleaning, explain how you discuss that. Do not assume a homeowner knows your distinction between an initial clean and a repeat booking.'),
             ('Explain access without putting private details on the homepage',
              'A useful cleaning site explains when the team discusses getting into the home and whether the owner needs to be present. It does not need to collect sensitive access instructions in the first enquiry. Say how that conversation takes place after a visit is agreed. The owner should understand the process before being asked to send information they would rather discuss directly.',
              'The warranty check includes guarantee language and may match a general statement or a disclaimer. It does not verify that a business returns to address missed work. If you offer a way to report a concern after the clean, explain the actual terms and contact route. Put that explanation beside the service scope so the owner can understand what the promise refers to. The survey does not assess cleaning quality or access practices.'),
             ('Keep repeat visits distinct from a one-time enquiry',
              'An owner asking for regular help needs to know how the next visit is arranged. Describe your process for agreeing a schedule and discussing changes. A person moving home may instead need a clean tied to a particular handover. Let them state that need without implying that an online request guarantees availability. Phone links can support either conversation if the site clearly says what the first contact can arrange.',
              'All the towns returned cleaning listings, and some names appeared in several places. The regional total counts those businesses once. State the areas you actually serve and whether the same scope is available there. Begin a site review with the clean description and booking confirmation, because the measured gap is between easy calling and sparse homepage forms. Then read the task list and later-contact instructions together. These changes can make the offer clearer; the measurement cannot predict repeat work or new enquiries.')
         ],
         limit='No cleaning tasks, staff checks, visit lengths, access arrangements or hygiene outcomes were measured. A phone setting and a booking phrase are not a tested booking experience.',
         faq=[
             ('Does a house cleaning booking prompt mean someone is assigned to my home?', 'Scheduling wording or tools appeared on [[booking]] of [[read]] house cleaning homepages. The read did not complete a booking. Confirm the date, scope and visit with the service before relying on the prompt.'),
             ('How often can I describe a move-out clean in a form on the first page?', 'A contact form was found in the fetched homepage on [[forms]] of [[read]] cleaning sites. A separate enquiry page may still exist. Ask how to send the room list and the planned move date if the homepage has no form.'),
             ('Do house cleaning guarantees show what happens if a task is missed?', 'Warranty or guarantee language matched on [[warranty]] of [[read]] cleaning homepages. The terms were not compared. Look for the process and conditions for reporting a concern about the agreed task list.')]),
    dict(slug='handyman-service', source='handyman-services',
         title='Handyman websites in West Michigan: finding a working site and describing small jobs',
         description='A dated measurement of West Michigan handyman listings and homepages, with advice for showing accepted tasks, enquiry details and the next step.',
         intro='A homeowner with a short repair list first needs to find out who will take it on. This survey starts with whether the listing even points to a website.',
         quick=[
             'A homeowner comparing handyman services may have to look beyond the listing for basic details. [[absent]] of the [[businesses]] businesses had no website or social profile linked in the saved listings. Among homepages that could be read, [[calls]] of [[read]] had a tap-to-call link. Those are different groups: a missing link is not a failed website.',
             'Scheduling wording is more common than a homepage contact form in the readable sample. A small repair list needs room for a description before it becomes an appointment. The homeowner should be able to ask whether the tasks fit the service without guessing at a trade label.',
             'First check that your own listing reaches the intended site. Then make the work you accept clear, give a route to send the list and explain how you decide the next step. Do not let a broad handyman label imply that every kind of home repair is included.'
         ],
         sections=[
             ('The listing is part of the enquiry path',
              'This handyman sample has a large gap between the business total and the readable homepage total. Some listings name no site, some link to a social or directory profile, and others lead to a site the single fetch could not read or excluded as not the business site. Keep those categories apart. A blocked page is not evidence that a handyman has no website, and a missing listing link is not proof that no site exists elsewhere.',
              'For a business, open your public listing and follow the website link as a visitor would. Check that it reaches the right page and that the accepted work is easy to understand. A homeowner may have found you while searching for help with several small tasks. If the landing page only gives a business name and no next step, the person has not yet learned whether to ask about their list.'),
             ('Give the repair list somewhere to go',
              'A contact form is less common than scheduling wording among the handyman homepages read. A form can be useful if it lets the owner explain several tasks rather than choose an exact appointment length. Ask for the town and a short description. If photographs help your review, say how to send them. Let the person say they are not sure which part needs attention.',
              'State how you review the list before confirming a visit. Some requests may fit the work you offer, while others may need a different specialist. Describe your actual limits plainly, without turning this article into a legal claim about who may perform a task. The sweep did not classify handyman jobs or verify qualifications. A clear accepted-work list helps the first conversation, but it is not a substitute for checking the requirements of the work.'),
             ('Make the first visit and charge discussion clear',
              'Free quote or assessment wording appears on some handyman sites, while money amounts appear rarely. That does not establish a local call-out rate or a standard way of charging. A figure might be a discount rather than a job price. Explain how your own business discusses the visit and how a quote is agreed after reviewing the repair list.',
              'If you use a minimum visit charge or a different approach for a longer list, publish only your checked terms and say what they cover. A homeowner deciding whether to combine tasks needs that context. Do not promise that everything on the list can be completed in a booking made before you have reviewed it. The common homepage measurements do not show task duration, materials needed or the number of visits a job requires.'),
             ('Build trust around the work you actually do',
              'Review displays and FAQ headings are both uncommon in the readable handyman sample. A useful project example can explain a task, what was agreed and what the result looked like, if it is work you can document. Keep the description narrow enough to be true. Do not borrow photos or imply that an unrelated kind of repair is part of your service.',
              'The town searches returned their full set of listings, with businesses appearing in several places. That does not establish the travel area of each handyman. State your own area and how you confirm a visit near its edge. Start improvements with the listing link, then the repair-list enquiry, then the visit explanation. This order responds to the large visibility gap in the saved sample. The data does not tell us whether a clearer page will change call volume, trust or search results.')
         ],
         limit='The collector did not check task lists, permissions to carry out work, insurance cover, repair quality or hourly rates. A printed licence number is not a verified qualification.',
         faq=[
             ('Does a missing handyman website link prove the business has no site?', 'No. [[absent]] of [[businesses]] handyman listings had neither a website nor a social profile linked. The survey did not search separately for unlinked sites. It measures what that saved listing gave the homeowner.'),
             ('How often can I send a handyman a repair list through the homepage?', 'A contact form appeared on [[forms]] of [[read]] readable handyman sites. The read did not test attachments or multiple-task requests. Ask how to send your list before treating a schedule prompt as a suitable appointment.'),
             ('Do handyman FAQs commonly explain which small jobs are accepted?', 'Only [[faqs]] of [[read]] readable handyman homepages had an FAQ heading or FAQ markup. The accepted tasks were not counted. Look for a service description or ask whether each item on your list fits the work offered.')]),
    dict(slug='foundation-repair-company', source='foundation-repair-companies',
         title='Foundation repair websites in West Michigan: assessment offers and written repair scopes',
         description='A small West Michigan foundation repair homepage sample, measuring assessments, guarantees and town coverage without diagnosing cracks or judging repair work.',
         intro='A crack or a change in a floor can leave an owner unsure what to ask. The website should explain an assessment without pretending the cause is known from a first enquiry.',
         quick=[
             'Homeowners comparing foundation repair companies will often find a free estimate or assessment offer. It appears on [[estimate]] of the [[read]] readable homepages. Warranty or guarantee wording appears on [[warranty]] of the [[read]]. These offers do not identify the cause of a problem or establish that a particular repair is needed.',
             'This is a small regional sample with uneven town coverage. Holland returned no local listings for this query on the survey date. That does not mean no foundation repair business serves Holland; it means this search supplied no listings to read there.',
             'Explain who carries out the assessment, what the owner receives and how the proposed work is set out. Put the complete repair scope and warranty terms ahead of a broad reassurance. A homeowner needs an understandable decision process, not a diagnosis made by a website headline.'
         ],
         sections=[
             ('Help the owner explain the concern without naming a repair',
              'A homeowner can describe where a crack is or what has changed without knowing the cause. Give that description a clear route to your team. Ask for the town and the part of the home involved, then explain how you arrange the assessment. Do not make the enquiry depend on selecting a repair system before anyone has looked at the property.',
              'Phone links are much more common than contact forms in the readable foundation sample. Keep the number beside a plain explanation of the first conversation. If a written enquiry starts with someone reviewing the details, say that. An owner should not mistake a submitted photo for a completed assessment. This article cannot say whether any observed condition is urgent or what work it requires. The survey did not inspect homes or compare diagnoses.'),
             ('Explain what the free assessment produces',
              'Free estimate or assessment wording is common here, but it can describe different visits. State who comes, what your business reviews and how findings are presented. Tell the homeowner whether they receive a written proposal and how questions can be asked before agreeing. Keep the difference between an assessment and a repair contract easy to understand.',
              'A useful proposal description says how the work is defined, what is included and how uncertainty is handled. If additional information is needed before deciding the approach, explain your process for obtaining it. The saved common measurements do not classify underpinning, wall work, waterproofing or any other repair method. None can be recommended from these counts. The practical website improvement is explaining the steps through which your own business reaches and documents a proposal.'),
             ('Give the repair promise a readable scope',
              'Warranty language is much more common than an FAQ section on the foundation homepages read. A worried owner may see reassurance before finding an explanation of the terms. Put the covered work and the route to the complete promise nearby. Say who handles a later concern and how the owner can contact them. Do not imply that a large guarantee headline covers every future issue at the property.',
              'The collector matches guarantee wording and can match disclaimers. It does not test a repair or determine the strength of cover. Review displays likewise show that a particular cue was present, not that a repair result was independently verified. Use documented examples with careful descriptions, and avoid suggesting that another homeowner’s problem establishes the cause of the reader’s own concern.'),
             ('Keep the small sample in view',
              'The town table is particularly important for this trade. The search returned fewer listings than its limit in several towns and none in Holland. Repeat businesses make the regional business total smaller again. Do not interpret the table as a census of foundation specialists, and do not use an empty search result to claim that a town lacks repair options.',
              'For a foundation repair company, state your travel area and explain how an owner confirms an assessment at their address. Scheduling language is rare in the readable sample, so a plain description of requesting a visit can be more useful than an unexplained calendar button. Begin your site review with the assessment steps, then the written proposal and the promise attached to the actual work. This survey offers evidence about homepage communication only. It cannot predict repair outcomes, enquiries or rankings.')
         ],
         limit='No cracks were assessed and no repair methods, engineering reports, building conditions or warranty terms were evaluated. The missing Holland result is a search limitation, not a finding about service availability.',
         faq=[
             ('Does a foundation free-assessment offer establish that my house needs repair?', 'No. Free estimate or assessment wording appeared on [[estimate]] of [[read]] readable foundation sites. It describes an offer, not a diagnosis. Ask what the visit reviews and what written explanation you receive.'),
             ('Do foundation repair guarantees prove a proposed method will solve my concern?', 'Warranty or guarantee wording matched on [[warranty]] of [[read]] foundation homepages. No method or outcome was tested. Read the scope and terms for the proposed work and ask how your questions will be addressed.'),
             ('Is a foundation homepage FAQ a common place to learn the assessment process?', 'An FAQ heading or FAQ markup appeared on [[faqs]] of [[read]] foundation sites. That is a narrow presentation measure. If the assessment steps are unclear, ask for them directly rather than inferring them from the free-offer headline.')]),
]


def load_data(page, directory=DATA):
    return json.loads((directory / f"{page['source']}-west-michigan-{DATE}.json").read_text())


def value(data, label):
    if label.startswith('town:'):
        town = label.split(':', 1)[1]
        return next(t['listings'] for t in data['towns'] if t['town'] == town)
    result = data['summary']
    for part in MEASURES[label][0].split('.'):
        result = result[part]
    return result


def number(n):
    return format(n, '.12g')


def count(data, label):
    return f'<span data-count="{html.escape(label, quote=True)}">{number(value(data, label))}</span>'


def prose(text, data):
    escaped = html.escape(text, quote=False)
    return re.sub(r'\[\[([a-z]+)\]\]', lambda m: count(data, m[1]), escaped)


def plain(text):
    return html.unescape(re.sub(r'<[^>]+>', '', text))


def block(text, tag):
    return re.search(rf'<{tag}\b.*?</{tag}>', text, re.S).group(0)


def filename(page):
    return f"{page['slug']}-websites-west-michigan.html"


def titles():
    result = {}
    for slug in EXISTING:
        name = f'{slug}-websites-west-michigan.html'
        source = (ROOT / 'articles' / name).read_text()
        result[name] = plain(block(source, 'h1'))
    result.update({filename(p): p['title'] for p in PAGES})
    return result


def table(data, labels, caption, denominator=False):
    cells = []
    for label in labels:
        suffix = f'<td>{count(data, "read")}</td>' if denominator else ''
        cells.append(f'<tr><th scope="row">{MEASURES[label][1]}</th><td>{count(data, label)}</td>{suffix}</tr>')
    last = '<th scope="col">Out of sites read</th>' if denominator else ''
    return ('<table class="datatable"><caption>' + caption + '</caption>'
            '<thead><tr><th scope="col">What was counted</th><th scope="col">Count</th>'
            + last + '</tr></thead><tbody>\n' + '\n'.join(cells) + '\n</tbody></table>')


def render(page, data):
    reference = (ROOT / 'articles/plumber-websites-west-michigan.html').read_text()
    url = BASE + 'articles/' + filename(page)
    title = html.escape(page['title'])
    description = html.escape(page['description'], quote=True)
    # Retain the reference's metadata conventions and assets without carrying its claims.
    head = reference[:reference.index('<body>')]
    head = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', head)
    for attribute in ('name="description"', 'property="og:description"'):
        head = re.sub(rf'(<meta {attribute} content=")[^"]*(">)',
                      lambda m: m[1] + description + m[2], head)
    head = re.sub(r'(<meta property="og:title" content=")[^"]*(">)',
                  lambda m: m[1] + html.escape(page['title'], quote=True) + m[2], head)
    head = head.replace(BASE + 'articles/plumber-websites-west-michigan.html', url)
    questions = [(q, prose(a, data)) for q, a in page['faq']]
    graph = {
        '@context': 'https://schema.org', '@graph': [
            {'@type': 'Article', '@id': url + '#article', 'headline': page['title'],
             'description': page['description'], 'datePublished': DATE, 'dateModified': DATE,
             'author': {'@type': 'Person', 'name': 'Matthew Kerr', 'url': BASE},
             'publisher': {'@type': 'Organization', 'name': 'Kerr & Co.', 'url': BASE},
             'mainEntityOfPage': url, 'image': BASE + 'assets/og-card.png?v=20260924'},
            {'@type': 'BreadcrumbList', 'itemListElement': [
                {'@type': 'ListItem', 'position': i, 'name': name, 'item': item}
                for i, name, item in [(1, 'Home', BASE), (2, 'Articles', BASE + 'articles/'),
                                      (3, page['title'], url)]]},
            {'@type': 'FAQPage', 'mainEntity': [
                {'@type': 'Question', 'name': q,
                 'acceptedAnswer': {'@type': 'Answer', 'text': plain(a)}} for q, a in questions]}
        ]}
    head = re.sub(r'(<script type="application/ld\+json">).*?(</script>)',
                  lambda m: m[1] + '\n' + json.dumps(graph, indent=2, ensure_ascii=False) + '\n  ' + m[2],
                  head, flags=re.S)
    quick = '\n'.join('<p>' + prose(p, data) + '</p>' for p in page['quick'])
    sections = '\n'.join('<h2>' + html.escape(s[0]) + '</h2>\n'
                         + '\n'.join('<p>' + prose(p, data) + '</p>' for p in s[1:])
                         for s in page['sections'])
    regional = table(data, list(MEASURES)[:10], 'The regional sample, before comparing homepage features')
    findings = table(data, list(MEASURES)[10:25],
                     'What was found on the readable homepages', denominator=True)
    medians = table(data, ['towns', 'size'], 'Middle values across the readable homepages')
    towns = '\n'.join('<tr><th scope="row">' + html.escape(t['town']) + '</th><td>'
                      + count(data, 'town:' + t['town']) + '</td></tr>' for t in data['towns'])
    faq = '\n'.join('<div class="faq-item"><h3>' + html.escape(q) + '</h3><p>' + a + '</p></div>'
                    for q, a in questions)
    related = '\n'.join(f'<a href="/articles/{name}">{html.escape(t)}</a>' for name, t in titles().items())
    return f'''{head}<body>
{block(reference, 'nav')}
<div class="wrap"><div class="crumb"><a href="/">Home</a> / <a href="/articles/">Articles</a> / {title}</div></div>
<header class="phero"><div class="article">
<div class="eyebrow">Measured · West Michigan websites</div>
<h1>{title}</h1><p class="lede">{html.escape(page['intro'])}</p>
<div class="ameta"><span>By Matthew Kerr</span><span>Published 11 November 2026</span><span>Updated 11 November 2026</span></div>
</div></header>
<div class="article" style="padding-top:2.2rem;padding-bottom:1rem;">
<div class="qa"><div class="qal">Quick answer</div>
{quick}
</div>
<h2>How this local read was made</h2>
<p>I asked the Brave Search API for its local listings for “{html.escape(data['trade'])} &lt;town&gt; MI” on <time datetime="2026-11-11">11 November 2026</time>. The eight towns were Grand Rapids, Wyoming, Kentwood, Grandville, Walker, Holland, Muskegon and Kalamazoo. The search kept the first ten listings per town, or fewer where Brave returned fewer. These are Brave’s listings, not Google’s map pack. They are a dated search sample, not a census or a ranking of workmanship.</p>
<p>Businesses listed in several towns were counted once across the region. The collector groups listings sharing a website host, so locations of a brand can be grouped together. The table shows that overlap separately. Each listed business homepage was fetched once, with no crawl of its other pages. Counts below use only the business sites that loaded and could be read. A site that blocked the fetch or could not be read is kept apart from a listing with no website.</p>
{regional}
<table class="datatable"><caption>Local listings returned by town, before regional overlap is removed</caption>
<thead><tr><th scope="col">Town searched</th><th scope="col">Listings returned</th></tr></thead><tbody>
{towns}
</tbody></table>
<h2>What the fetched homepages contained</h2>
<p>The read used the first HTML sent by each site, before scripts run. It can miss content drawn by JavaScript after load, including forms and reviews. A blank result here does not prove a feature is absent from the full site. The phone-screen setting is a code check, not a mobile usability test. Booking wording can match sentences or page code without proving that a working calendar exists.</p>
{findings}
{medians}
<p>Review displays mean a recognised widget, a printed star figure or a printed review count, not every testimonial. The FAQ check can find markup without visible answers. Warranty wording includes guarantees and can occur in disclaimers. An amount of money can be a price, coupon or finance offer. Licence numbers and claims were not verified. The middle HTML size excludes images and other files, so it is not a speed test.</p>
<p>{html.escape(page['limit'])}</p>
{sections}
<h2>Questions before the first enquiry</h2>
<div class="faq">{faq}</div>
<div class="author"><div class="abody"><div class="aname">Matthew Kerr</div>
<p>I build websites in Grand Rapids at <a href="/">Kerr &amp; Co.</a>. This read uses saved local measurements. It publishes aggregate findings without naming the businesses measured.</p></div></div>
<section class="anext" data-related="trades"><h2>Same survey, other trades</h2>
<p>These pages use the same local-listing method. The earlier trade pages report their own dates and samples. Read those dates before making a comparison; the lists below do not put different trades into a ranking.</p>
<div class="related">{related}</div></section>
<p>Want help making the next step clearer on your own site? See our <a href="/services/contractor-website-design-grand-rapids.html">contractor website service</a> or <a href="/#contact">get in touch</a> with your website and town.</p>
</div>
{block(reference, 'footer')}
</body>
</html>
'''


def sitemap():
    source = (ROOT / 'sitemap.xml').read_text()
    generated_urls = {BASE + 'articles/' + filename(page) for page in PAGES}
    # Replace our blocks, including dates, while leaving every older URL untouched.
    source = re.sub(r'  <url>\n.*?  </url>\n',
                    lambda m: '' if any(f'<loc>{url}</loc>' in m[0] for url in generated_urls) else m[0],
                    source, flags=re.S)
    for page in PAGES:
        url = BASE + 'articles/' + filename(page)
        addition = f'  <url>\n    <loc>{url}</loc>\n    <lastmod>{DATE}</lastmod>\n  </url>\n'
        source = source.replace('</urlset>', addition + '</urlset>')
    return source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--data-dir', type=Path, default=DATA)
    args = parser.parse_args()
    outputs = {Path('articles') / filename(p): render(p, load_data(p, args.data_dir)) for p in PAGES}
    outputs[Path('sitemap.xml')] = sitemap()
    if args.check:
        failures = []
        with tempfile.TemporaryDirectory(prefix='bbk-trade-check-') as temp:
            for relative, content in outputs.items():
                built = Path(temp) / relative
                built.parent.mkdir(parents=True, exist_ok=True)
                built.write_text(content)
                target = ROOT / relative
                if not target.exists() or target.read_bytes() != built.read_bytes():
                    failures.append(str(relative))
        if failures:
            print('Different or missing generated files:\n' + '\n'.join(failures))
            return 1
        print('OK: twelve trade pages and sitemap match a temporary rebuild')
    else:
        for relative, content in outputs.items():
            (ROOT / relative).write_text(content)
        print('Built twelve trade pages and updated sitemap.xml')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
