"use strict"

const debug = false;
//const debug = true;

// thershold for fuzzy author matching - low since the names can be short.
const stringThreshold = 0.6;

// Variables specific to the scopus labels used
const SCOPUS_CITATIONS = "Cited by";
const SCOPUS_YEAR = "Year";
const SCOPUS_AUTHOR = "Authors";
const SCOPUS_TITLE = "Title";
const SCOPUS_REFERENCE = "References";
const SCOPUS_SOURCE = "Source title";
const SCOPUS_DOCTYPE = "Document Type";
const SCOPUS_DOI = "DOI";
const SCOPUS_OPEN_ACCESS = "Open Access";
const SCOPUS_PUBLISHER = "Publisher";
const SCOPUS_AUTHOR_KEYWORDS = "Author Keywords";
const SCOPUS_INDEXED_KEYWORDS = "Indexed Keywords";

//const SCOPUS_ARTICLE = "Article";
//const SCOPUS_PROCEEDINGS = "Conference Paper";

let SCOPUS_AUTHOR_DELIMINATOR = ",";
let SCOPUS_REFERENCE_DELIMINATOR = ";";
let SCOPUS_REFERENCE_AUTHOR_DELIMINATOR = ",";  // the delimiter used between the author list within each reference

let anonymize = false;

if (debug)
    {
    fetch('./scopus.json')
        .then((response) => response.json())
        .then((json) => analyse(json));
    }

// Bootstrapping
window.addEventListener('DOMContentLoaded', (event) => setup());
function setup()
    {
    // Add file load handler
    const fileSelector = document.getElementById("file-selector");
	fileSelector.addEventListener('change', (event) => loadFile(event));        
    }
// retrieving file contents in excel format	as JSON object
function loadFile(event)
    {
    hide("configuration");
    show("processing");

    const files = event.target.files;

    for (var i = 0, f; f = files[i]; i++) 
        {			
        var reader = new FileReader();

        reader.onload = (function(theFile) 
            {
            return function(e) 
                {
                // set the anonymization mode if selected
                anonymize = document.getElementById("anonymize").checked;
                var data = new Uint8Array(e.target.result);
                var workbook = XLSX.read(data, {type: 'array'});	
                for (var sheetName of workbook.SheetNames)
                    {
                    let json = XLSX.utils.sheet_to_row_object_array(workbook.Sheets[sheetName]);
                    analyse(json);
                    }
                };
            })(f);		
        reader.readAsArrayBuffer(f);
        }
    }

function filterOuput(text)
    {
    return anonymize
        ? anonymizeText(text)
        : text;
    }

function anonymizeText(text)
    {
    const vocalLower = "aeiouy";
    const vocalUpper = "AEIOUY";
    const consonantLower = "bcdfghjklmnprstvw";
    const consonantUpper = "BCDFGHJKLMNPRSTVW";
    let chars = text.split("");
    chars = chars.map(ch => 
        {
        return vocalLower.includes(ch)
            ? vocalLower[Math.floor(Math.random()*vocalLower.length)]
            : vocalUpper.includes(ch)
                ? vocalUpper[Math.floor(Math.random()*vocalUpper.length)]
                : consonantLower.includes(ch)
                    ? consonantLower[Math.floor(Math.random()*consonantLower.length)]
                    : consonantUpper.includes(ch)
                        ? consonantUpper[Math.floor(Math.random()*consonantUpper.length)]
                        : ch;           
        });
    return chars.join("");
    }

function analyse(json)
    {
    let GUIvariables = {};

    let noPublications = json.length;
    GUIvariables.noPublications = noPublications;

    // check file for the right contents
    [SCOPUS_CITATIONS, SCOPUS_YEAR, SCOPUS_AUTHOR, SCOPUS_TITLE, SCOPUS_REFERENCE, SCOPUS_SOURCE]
        .forEach(label =>
            {
            if (!json.some(({[label]:item}) => item != undefined))
                    {
                    console.log("Field missing "+label);
                    }
            });  

    // filter editorials and frontmatter (reuse below if relevant and for simplicity)
    let cleanJson = json.filter(({[SCOPUS_AUTHOR]:Authors}) => Authors != undefined)
                        .filter(({[SCOPUS_REFERENCE]:References}) => References != undefined)
                        .map((o, index) => ({...o, index:index, annotations:[]}));                       
//    cleanJson = json; // uncomment if we do not want editorials etc.
    // find type of deliminator used
    SCOPUS_AUTHOR_DELIMINATOR = cleanJson.some(({[SCOPUS_AUTHOR]:Authors}) => Authors.includes(";")) ? ";" : ",";
    SCOPUS_REFERENCE_DELIMINATOR = cleanJson.some(({[SCOPUS_REFERENCE]:References}) => References.includes(";")) ? ";" : ",";

    // get academic age.
    GUIvariables.academicAge = (new Date()).getFullYear()
                       - Math.min(...cleanJson.map(({[SCOPUS_YEAR]:year}) => year));
    // estimate career percentage based 40 year career
    GUIvariables.remainingCareer = 40 - GUIvariables.academicAge; 

    // for reference - get the total no of refs in each publication
    cleanJson = cleanJson.map((o) => ({...o, referenceCount: o[SCOPUS_REFERENCE].split(SCOPUS_REFERENCE_DELIMINATOR).length}));

    // find author this is about - the most frequent one
    const allAuthorsList = cleanJson.map(({[SCOPUS_AUTHOR]:Authors}) => Authors)
                            .filter(authors => authors != undefined)
                            .flatMap(authors => authors.split(SCOPUS_AUTHOR_DELIMINATOR))
                            .map(author => author.replaceAll("-","")) // evidence of inconsistent use of hyphens                           
                            .map(author => author.trim());
    let onAuthorsList = Object.groupBy(allAuthorsList, (author => author));
    let uniqueAuthors = [...Object.keys(onAuthorsList)];
    let authorsStat = uniqueAuthors.map(author => ({Author:author, Frequency: onAuthorsList[author].length}))
                            .sort((a,b) => b.Frequency - a.Frequency);
    let mainAuthor = authorsStat[0].Author;
    let mainAuthorAlternative = mainAuthor.replaceAll(" ",", ");

    GUIvariables.mainAuthor = filterOuput(mainAuthor);

    GUIvariables.totalCollaborators = uniqueAuthors.length;

    // ensure we normalise and remove diacritic variations - diacritic invariant string comparison
    let mainAuthorNormalized = normalizeString(mainAuthor);
    let mainAuthorAlternativeNormalized = normalizeString(mainAuthorAlternative);
    // list of unique authors
    addFrequencyList("frequencyListTemplate", "entry", "recurringAuthorList", allAuthorsList.filter(name => normalizeString(name) != mainAuthorNormalized), 15 );

    let authorKeywords = cleanJson.map(({[SCOPUS_AUTHOR_KEYWORDS]:keywords}) => keywords)
             .filter(keywords => keywords != undefined)
             .flatMap(keywords => keywords.split(SCOPUS_REFERENCE_DELIMINATOR))
             .flatMap(keyword => keyword.split(" ")); 
    let indexedKeywords = cleanJson.map(({[SCOPUS_INDEXED_KEYWORDS]:keywords}) => keywords)
             .filter(keywords => keywords != undefined)
             .flatMap(keywords => keywords.split(SCOPUS_REFERENCE_DELIMINATOR))
             .flatMap(keyword => keyword.split(" ")); 
    let keywords = [...authorKeywords, ...indexedKeywords]
            .map(keyword => keyword.toLowerCase().trim())
            .filter(keyword => keyword.length > 0);

    addFrequencyList("frequencyListTemplate", "entry", "recurringTopicList",keywords, 20);

    // recurring themes
    let sources = cleanJson.map(({[SCOPUS_SOURCE]:source}) => source)
                           .filter(source => source != undefined)
                           .map(source => source.replaceAll(/\d+/g,""))
                           .map(source => source.replaceAll("  "," ").trim());
    sources.sort();
    let sourcesHistogram = Object.groupBy(sources,(e => e));
    let keySources = Object.keys(sourcesHistogram);
    let sourceSizes = keySources.map(source => sourcesHistogram[source].length);
    // based on the diversity measure developed for the conference analysis thingy
    let withinPubChannel = sourceSizes.some(e => e > 1);
    let penalty = withinPubChannel
            ? sourceSizes.reduce((accum, e) => accum + e ** 2, 0) ** 0.5
            : sourceSizes.length;
    let channelDiversity = withinPubChannel
            ? 1 / penalty
            : 1 - 1 / (penalty + 0.51);
    GUIvariables.channelDiversity = channelDiversity.toFixed(3);
    addFrequencyList("frequencyListTemplate", "entry", "recurringChannelList",sources, 10);

    // get author position stats
    let firstAuthor = 0, middleAuthor= 0, lastAuthor = 0, soloAuthor = 0;
    cleanJson.map(({[SCOPUS_AUTHOR]:Authors}) => Authors)
             .filter(authors => authors != undefined)
             .forEach(authors => 
                    {
                    let authorList = authors.replaceAll("-","")
                                        .split(SCOPUS_AUTHOR_DELIMINATOR)
                                        .map(author => author.trim())
                                        .map(author => normalizeString(author));
                    if (authorList.length == 1)
                        {
                        soloAuthor++;
                        }
                    else if (dice(authorList[0], mainAuthorNormalized) > stringThreshold)
                        {
                        firstAuthor++;
                        }
                    else if (dice(authorList.pop(), mainAuthorNormalized) > stringThreshold)
                        {
                        lastAuthor++;
                        }
                    else
                        {
                        middleAuthor++;
                        }
                    });
    // convert to percentages
    GUIvariables.soloAuthor = Math.round(100 * soloAuthor / noPublications);
    GUIvariables.firstAuthor = Math.round(100 * firstAuthor / noPublications);
    GUIvariables.middleAuthor = Math.round(100 * middleAuthor / noPublications);
    GUIvariables.lastAuthor = Math.round(100 * lastAuthor / noPublications);

    // get document type histogram
    let docTypeHistogram = Object.groupBy(cleanJson.map(({[SCOPUS_DOCTYPE]:docType}) => docType),(e => e));
    let docTypes = Object.keys(docTypeHistogram);
    docTypes.sort((a, b) => docTypeHistogram[b].length - docTypeHistogram[a].length);    
    GUIvariables.mostFrequentDocType = docTypes[0];
    GUIvariables.mostFrequentDocTypeVal = Math.round(100 * docTypeHistogram[GUIvariables.mostFrequentDocType].length / noPublications);
    GUIvariables.secondMostFrequentDocType = docTypes[1];
    GUIvariables.secondMostFrequentDocTypeVal = Math.round(100 * docTypeHistogram[GUIvariables.secondMostFrequentDocType].length / noPublications);
    GUIvariables.noOthers = 100 - (GUIvariables.mostFrequentDocTypeVal + GUIvariables.secondMostFrequentDocTypeVal);

    // find citations and h-index
    // find cited publications and sort citation count 
    let citationList = cleanJson.filter(({[SCOPUS_CITATIONS]:citations}) => Number(citations) > 0);
    citationList.sort((a,b) => b[SCOPUS_CITATIONS] - a[SCOPUS_CITATIONS]);
    // find h-index
    let hList = citationList.filter(({[SCOPUS_CITATIONS]:citations},rank) => Number(citations) >= rank);
    let hIndex = hList.length - 1;
    GUIvariables.hIndex = hIndex;

    // find g-index - imperative
 /*   let citations = citationList.map(({[SCOPUS_CITATIONS]:citations}) => Number(citations));
    let gIndex;
    let sum = 0;
    for (let i = 0; i < citations.length; i++)
        {
        gIndex = i + 1; // zero index
        let g = gIndex ** 2;
        sum += citations[i];
        if (sum < g)
            {
            gIndex = i;
            break;
            }
        }*/
    // find g-index - functional - traveres the entire array but clean code
    let citations = citationList.map(({[SCOPUS_CITATIONS]:citations}) => Number(citations));
    let gIndex = citations.reduce((accum, cites, i) => 
        {
        let sum = accum.sum + cites;
        let g = i + 1;
        let g2 = g ** 2;
        return (sum < g2)
            ? accum
            : {sum, g, g2};
        }, {sum:0}).g;
    GUIvariables.gIndex = gIndex;

    // Inidivualised h-index
    // For each cited paper, find the number of authors, divide citations by the number of authors
    let citationsPerAuthor = citationList.map(({[SCOPUS_CITATIONS]:citations, [SCOPUS_AUTHOR]:authors}) => Number(citations)/(authors.split(SCOPUS_AUTHOR_DELIMINATOR).length));
    // Rank the normalized citations.
    citationsPerAuthor.sort((a, b) => b - a);
    // Compute h-index of the result
    let hIndexIndividual = citationsPerAuthor.filter((cites, i) => cites > i+1).length;
    GUIvariables.hIndexIndividual = hIndexIndividual;

    // hA-index
    // For each paper the number of citations are divided by age
    let currentYear = (new Date()).getFullYear();
    let citationsPerYear = citationList.map(({[SCOPUS_CITATIONS]:citations, [SCOPUS_YEAR]:year}) => Number(citations)/(currentYear - Number(year) + 1));
    // Rank the normalized citations.
    citationsPerYear.sort((a, b) => b - a);
    // Compute h-index of the result - result is the rate of citations per year.
    let haIndex = citationsPerYear.filter((cites, i) => cites > i+1).length;
    GUIvariables.haIndex = haIndex;

    // find self references
    // start by extracting all references from all records
    let selfCitationsList = cleanJson.filter(({[SCOPUS_REFERENCE]:References}) => References != undefined)
                               .map(({[SCOPUS_REFERENCE]:References,index, [SCOPUS_YEAR]:year}) => 
        {
        let references = References.split(SCOPUS_REFERENCE_DELIMINATOR);
        let selfCite = references.filter(ref => isSelfCitation(normalizeString(ref), mainAuthorNormalized, mainAuthorAlternativeNormalized));
        return ({citingDoc:index, selfCitations:selfCite, year});
        })
                .filter(({selfCitations}) => selfCitations.length > 0);

    // find publication with most citations
    selfCitationsList.sort((a,b) => b.selfCitations.length - a.selfCitations.length);

console.log("step3:");
console.time();

    // setup preprocessed datastructure for speed
    let titleBigrams = citationList.map(({[SCOPUS_TITLE]:text}) => prepareWordBigram(text));
    let titleSets = titleBigrams.map(bigram => new Set(bigram));
    titleBigrams = titleSets.map(set => [...set]); // keep unique instances only

    // determine which paper is cited
    let citationHistogram = {}; // keep track of self-citations per paper
    let citationTimes = {}; // keep track of when a reference was cited
    selfCitationsList.forEach(({citingDoc, selfCitations, year:sourceYear}) =>
        {
        // setup preprocessed datastructure for speed            
        let selfReferenceBigrams = selfCitations.map(text => prepareWordBigram(text));
        let selfReferenceSets = selfReferenceBigrams.map(bigram => new Set(bigram));
        selfReferenceBigrams = selfReferenceSets.map(set => [...set]); // keep unique instances only

        selfReferenceBigrams.forEach((refBigram, referenceIndex) => 
            {                   // filter citations prior to the cited document
            let distances = titleBigrams.map((titleBigram,titleIndex) => wordBigramDice(titleBigram, refBigram, titleSets[titleIndex], selfReferenceSets[referenceIndex]));
            // correct for NaN's if they occur
            distances = distances.map(s => isNaN(s) ? 0: s );
//            let max = Math.max(...distances);   
            let max = distances.reduce((a, b) => Math.max(a, b), -Infinity); // use this one instead in case the list is very large
            let index = distances.indexOf(max); 
            if (max > 0.8)      // if below this limit, it is probably a reference to a non-scopus source
                {
                index = citationList[index].index;
                citationHistogram[index] = (citationHistogram[index]??0) + 1;
                let yearArray = (index in citationTimes) ? citationTimes[index]: [];
                let year = Number(cleanJson[citingDoc][SCOPUS_YEAR]);
                yearArray.push(year);
                citationTimes[index] = yearArray;
                }            
            });
        });

console.timeEnd();

    // start by extracting all references from all records
    let allReferences = cleanJson.filter(({[SCOPUS_REFERENCE]:References}) => References != undefined)
                                 .map(({[SCOPUS_REFERENCE]:References}) => References)
                                 .flatMap(references => references.split(SCOPUS_REFERENCE_DELIMINATOR))
                                 .filter(reference => !isSelfCitation(normalizeString(reference), mainAuthorNormalized, mainAuthorAlternativeNormalized))    // we do not include self-citations in this stat
                                 .map(reference => reference.trim().toLowerCase());
    // sort references of decreasing lenght
    allReferences.sort((a, b) => b.length - a.length);                                 
    // fuzzy clustering of refereces
    let groupedRefs = {};
    let keyRef = [];

    // lookup structure
    let referenceBigrams = {};  // Objects for fast lookup.
    let referenceSets = {};    
    allReferences.forEach(reference => 
        {
        referenceBigrams[reference] = prepareWordBigram(reference);
        referenceSets[reference] = new Set(referenceBigrams[reference]);
        referenceBigrams[reference] = [...referenceSets[reference]];
        });

console.log("step 4", allReferences.length);
console.time();

    // find frequent references- maybe not essential, therefore optional
    if (document.getElementById("frequentReferences").checked)
        {
        allReferences.forEach(reference => 
            {
            // using character level bigrams
            let idx = keyRef.findIndex(comparisonRef => optimizedWordBigramDice(referenceBigrams[reference], referenceBigrams[comparisonRef], referenceSets[reference], referenceSets[comparisonRef], 0.6) > 0.6);
            if (idx > -1)   // found match
                {
                groupedRefs[keyRef[idx]].push(reference);   // connecting the variations to the key entry
                }
            else  // no match
                {
                keyRef.push(reference);        // add as new unique item
                groupedRefs[reference] = [reference];   // initiate a first item in the hsitogram    
                }
            });
console.timeEnd();

        // sort the results
        keyRef.sort((a, b) => groupedRefs[b].length - groupedRefs[a].length);

        GUIvariables.mostFrequentReuse = groupedRefs[keyRef[0]].length;
        GUIvariables.noReusedReferences = keyRef.filter(reference => groupedRefs[reference].length > 1).length;
        GUIvariables.reuseIndex = keyRef.filter((reference, rank) => groupedRefs[reference].length >= rank).length;

        let recurringReferences =  keyRef.map(reference => ({item: capitalize(reference, true), frequency: groupedRefs[reference].length}));
        // list of unique authors
        addPreparedFrequencyList("frequencyListTemplate", "entry", "reusedReferenceList", recurringReferences, 20 );
        }
    else
        {   // hide the form things related to references
        ["refStat1", "refStat2", "refStat3", "refStat4"].forEach(id => hide(id));
        }

    // add self-citation stats to the citation list counting towards h-index
    hList = hList.map(o => o.index in citationHistogram ? ({...o, selfCitations:citationHistogram[o.index]}): o);

    // add citation stats to main list
    citationList = citationList.map(pub => 
        {
        let allCitations =  Number(pub[SCOPUS_CITATIONS]);
        let selfCitations = pub.index in citationHistogram ? citationHistogram[pub.index]: 0;
        selfCitations = Math.min(selfCitations, allCitations);  // simple error fix        
        return {...pub, allCitations, selfCitations};
        });
       
    // split the citations into those that contribute towards h-index and those that do not.
    hList = hList.map(o => 
        {
        let selfCitations = o.selfCitations??0;
        let allCitations = o[SCOPUS_CITATIONS]??0;
        selfCitations = Math.min(selfCitations, allCitations);  // correct potential over-counts
        let otherCitations = allCitations - selfCitations;
        let otherPart = Math.min(otherCitations, hIndex);
        let selfPart = hIndex - otherPart;
        let extraOtherPart = otherCitations - otherPart;
        let extraSelfPart = selfCitations - selfPart;
        return ({...o, selfPart, otherPart, extraSelfPart, extraOtherPart});
        })
    // sort on the selfPart of h-index
    hList.sort((a,b) => b.selfPart - a.selfPart);   
        
    // find corrected hIndex by subtracting self-references
    let correctedHList = hList.map(({otherPart, extraOtherPart}) => otherPart + extraOtherPart);
    correctedHList.sort((a, b) => b - a);
    GUIvariables.correctedHIndex = correctedHList.filter((citations, rank) => citations > rank + 1)
                                        .length -1;

    // find most recent publication
    GUIvariables.mostRecentPublication = Math.max(...cleanJson.map(({[SCOPUS_YEAR]:year}) => year).filter(year => year != undefined).map(year=> Number(year)));
    GUIvariables.ageMostRecentPublication = (new Date().getFullYear() - GUIvariables.mostRecentPublication);

    // show list of publishers
    let publisherList = cleanJson.filter(({[SCOPUS_PUBLISHER]:publisher}) => publisher != undefined)
                                    .map(({[SCOPUS_PUBLISHER]:publisher}) => publisher);
    addFrequencyList("frequencyListTemplate", "entry", "publisherList",publisherList);

    // compute reference statistics
    // median mumber of references
    let noRefs = cleanJson.filter(({[SCOPUS_REFERENCE]:References}) => References != undefined)
                                    .map(({[SCOPUS_REFERENCE]:References}) =>References.split(SCOPUS_REFERENCE_DELIMINATOR).length);
    noRefs.sort();
    GUIvariables.medianNoReferences = noRefs[Math.floor(noRefs.length/2)];

    // median reference age.
    let medianAges = cleanJson.filter(({[SCOPUS_REFERENCE]:References}) => References != undefined)
                                    .map(({[SCOPUS_REFERENCE]:References, [SCOPUS_YEAR]:year}) => 
        {
        year = Number(year);
        let references = References.split(SCOPUS_REFERENCE_DELIMINATOR);
        let ages = references.map(reference => Number(reference.match(/\d{4}/)))
                            .filter(yr => yr > 1800 && yr <= year)
                            .map(yr => year - yr);
        ages.sort();
        return ages[Math.floor(ages.length/2)];
        });
    medianAges.sort();
    GUIvariables.medianReferenceAge = medianAges[Math.floor(medianAges.length/2)];

    // annotate publications high citation count from others
    const impactfulFactor = 2.5;
    hList.forEach(({index, otherPart, extraOtherPart}) =>  
        {
        if (otherPart + extraOtherPart > hIndex * impactfulFactor)
            {
            citationList.find(({index:index2}) => index == index2)
                        .annotations.push("*** Impactful!")
            }
        });

    // annotate publications with high self part
    hList.filter(({selfPart}) => selfPart > 0)
         .forEach(({index, selfPart, otherPart}) => 
        {
        citationList.find(({index:index2}) => index == index2)
                    .annotations.push(`Possible inflated h-index with ${selfPart} self-citations (${otherPart} by others)`);
        });

    // percentage of manipulations
    let totalSelfPart = hList.reduce((accumulator, {selfPart}) => accumulator + selfPart, 0);
    GUIvariables.hIndexManipulation = Math.round(100*totalSelfPart/hIndex ** 2);

     // ...also need some timeline analysis. 
    // for each self-cited reference make timline interval?
    let citationTimeProfile = citationList.filter(({index}) => index in citationTimes)
            .map(o => ({...o, earliest: Math.min(...citationTimes[o.index]),mostRecent: Math.max(...citationTimes[o.index])}));

    // for cleanliness, remove duplicate years and sort in order
    citationTimeProfile.forEach(({index}) => 
        {
// we also need to keep datastructure of when a particular reference was cited - not done yet             
        let arr = [...new Set(citationTimes[index])];
        arr.sort();
        citationTimes[index] = arr;
        });

    let humpBackList = citationList.filter(({[SCOPUS_CITATIONS]:citations},index) => 
        {
        let endCase = index == 0 || index >= citationList.length - 1;
        let prev = endCase ? Number.MAX_SAFE_INTEGER : citationList[index - 1][SCOPUS_CITATIONS];
        let next = endCase ? 0: citationList[index + 1][SCOPUS_CITATIONS];
        let largeChange = prev - next > 1; // at least a change of 2
        let closerToPrevious = prev - citations < citations - next;
        // humpback if the numbers are different AND the current is closer to the previous than the next going in decending order
        return !endCase && closerToPrevious && largeChange;
        });

    // report aggrgated humpbacks
    GUIvariables.noHumpbacks = humpBackList.length;
    humpBackList.forEach(({index}) => 
        {
        citationList.find(({index:index2}) => index == index2)
                    .annotations.push("Humpback");
        });

    GUIvariables.uncitedPublications = Math.round(100 * (noPublications - citationList.length)/noPublications)

    // ratio of open access publications
    let oaPubs = cleanJson.filter(({[SCOPUS_OPEN_ACCESS]:oa}) => oa != undefined)
                          .length;
    GUIvariables.percentageOpenAccess = Math.round(100 * oaPubs / noPublications);

    // build interactive publication list
    let insertionPoint = document.getElementById("insertionPointReport");

    let maxCitations = citationList[0][SCOPUS_CITATIONS];
    let scalingFactor = 100 / maxCitations;

    let numberCitations = 0;
    let noSelfCitations = 0;

    // add inflated h-index varnings
    citationList.filter((pub,index) => index + 1 > hIndex)
                .forEach(pub => 
        {
        if (pub.selfCitations > 1 && pub.selfCitations > pub.allCitations/2)
            {
            pub.annotations.push(`Large portion of self-citations (${Math.round(100 * pub.selfCitations / pub.allCitations)}%, ${pub.selfCitations} out of ${pub.allCitations}).`);
            }
        });

    citationList.forEach((pub, index) => 
        {
        let pubParams = {pubAnnotation:pub.annotations.join(", "), pubNumber:`#${index + 1}`, pubDetails:"",citationInfo: pub.allCitations};
        let elements = createAndPopulateTemplate("publication", insertionPoint, pubParams, false);            
        elements.pubAnnotation.id =  "annotation"+pub.index;

        // populate the reference,  using abbreviated APA style
        const truncAuthor = 40;
        const truncTitle = 100;
        const truncSource = 60;
        let formattedRefInfo = {authors:filterOuput((pub[SCOPUS_AUTHOR]??"").substring(0, truncAuthor)), year:(pub[SCOPUS_YEAR]??""), title:filterOuput((pub[SCOPUS_TITLE]??"").substring(0, truncTitle)), source:filterOuput((pub[SCOPUS_SOURCE]??"").substring(0, truncSource))};
        let formattedPubElement = createAndPopulateTemplate("formattedPublicationTemplate", elements.pubDetails, formattedRefInfo, "formattedRef");            
        let selfCitationRate = Math.round(100*pub.selfCitations/pub.allCitations)
        let selfCitationInfo = `${pub.selfCitations} (${selfCitationRate}%) self citations`;
        let doi = pub[SCOPUS_DOI];

        let doiLink = doi != undefined 
            ? `https://doi.org/${pub[SCOPUS_DOI]}`
            : "";
        formattedPubElement.formattedRef.id = pub.index;
        formattedPubElement.formattedRef.href = doiLink;
        formattedPubElement.formattedRef.title = `${selfCitationInfo} (${doiLink}`;

        if (index < hIndex) // highlight index of h-index publicaitons
            {
            elements.pubNumber.classList.add("toLift");
            }

        // attach bargraph, first lookup details
        let details = (index < hIndex)
            ? hList.find(({index}) => index == pub.index)
            : null;
        let [selfPart, otherPart, extraSelfPart, extraOtherPart] = ((details != null)
            ? [details.selfPart, details.otherPart, details.extraSelfPart, details.extraOtherPart]
            : [0, 0, pub.selfCitations, pub.allCitations - pub.selfCitations])
             .map(value => (value*scalingFactor)); // scale all the values - causes problems dropping it

        let graphParams = {hIndexOtherBar:"", hIndexSelfBar:"", otherCitationsBar:"",selfCitationsBar:""};
        let graphElements = createAndPopulateTemplate("barGraphTemplate", elements.pubDetails, graphParams, "barGraph");            
             
        // setting up the graph
 /*     // First version  
        graphElements.hIndexOtherBar.style.left = ""+(0)+"rem";
        graphElements.hIndexOtherBar.style.width = ""+(otherPart)+"rem";
        graphElements.hIndexSelfBar.style.left = ""+(otherPart)+"rem";
        graphElements.hIndexSelfBar.style.width = ""+(selfPart)+"rem";
        graphElements.selfCitationsBar.style.left = ""+(otherPart+selfPart)+"rem";
        graphElements.selfCitationsBar.style.width = ""+(extraSelfPart)+"rem";
        graphElements.otherCitationsBar.style.left = ""+(otherPart+selfPart+extraSelfPart)+"rem";
        graphElements.otherCitationsBar.style.width = ""+(extraOtherPart)+"rem";
*/
        graphElements.hIndexOtherBar.style.left = ""+(0)+"rem";
        graphElements.hIndexOtherBar.style.width = ""+(otherPart)+"rem";
        graphElements.hIndexSelfBar.style.left = ""+(otherPart)+"rem";
        graphElements.hIndexSelfBar.style.width = ""+(selfPart)+"rem";

        // otherPart+selfPart
        graphElements.otherCitationsBar.style.left = ""+(otherPart+selfPart)+"rem";
        graphElements.otherCitationsBar.style.width = ""+(extraOtherPart)+"rem";
        // otherPart+selfPart+extraOtherPart
        graphElements.selfCitationsBar.style.left = ""+(otherPart+selfPart+extraOtherPart)+"rem";
        graphElements.selfCitationsBar.style.width = ""+(extraSelfPart)+"rem";

        // other bookkeeping
        numberCitations += pub.allCitations;
        noSelfCitations += pub.selfCitations;  
        });



    GUIvariables.numberCitations = numberCitations;
    GUIvariables.percentSelfCitations = Math.round(100 * noSelfCitations / numberCitations);

    // compute self-citation index - as h-index but with self citations.
    GUIvariables.sIndex = noSelfCitations > 0
                           ? citationList.map(({selfCitations}) => selfCitations)
                                      .toSorted((a, b) => b - a)
                                      .filter((cites,rank) => cites > rank)
                                      .pop()
                           : 0;

    // export excel data
    if (document.getElementById("excelDump").checked)
        {
        let infections = citationList.map((pub, i) => ({rank: i+1, title: pub[SCOPUS_TITLE], selfCitations: pub.selfCitations, otherCitations: pub.allCitations - pub.selfCitations }));
        var wb = XLSX.utils.book_new();
        let sheet = XLSX.utils.json_to_sheet(infections);
        XLSX.utils.book_append_sheet(wb, sheet, "infection");  
        XLSX.writeFile(wb,"infection-data.xlsx");       
        }

    // add timeline plot
    //---------------
    // first, get list of years
    let yearList = citationList.map(pub => pub[SCOPUS_YEAR]);
    yearList = [...new Set(yearList)];
    yearList.sort();
    // get relative size of bars
    let noBars = yearList.length;
    let barWidth = (100 - noBars*1) / noBars;
    // sum up self-citations for each year
    let selfCiteList = yearList.reduce((ac, year) => 
        {
        let pubs = citationList.filter(pub => pub[SCOPUS_YEAR] == year);
        let selfCitations = pubs.reduce((accumulator, pub) => accumulator + pub.selfCitations, 0);   
        return ({...ac, [year]:selfCitations}); 
        }, {});

    yearList.map(year => 
        {
        let timelineBar = createAndPopulateTemplate("timelineBarTemplate", document.getElementById("insertionTimeline"), {label:`(${selfCiteList[year]}) ${year}`},"timelineBarInstance");
        let timelineScalingFactor = 1;  // change if needed
        // truncate values if they are too large
        let val = (Math.min(100, selfCiteList[year] * timelineScalingFactor)).toFixed(0)+"%";
        timelineBar.timelineBarInstance.style.height = val;    
        timelineBar.timelineBarInstance.style.width = barWidth+"%";    
        });

    // fan of - peers most frequently cited by the author (not self citations)
    let citingAuthorsList = allReferences.flatMap(ref => ref.split(".,"))
        .map(name => name.trim()+".")                      // remove space used as separator in reference
        .filter(name => name !== "et al.")             // filter et al.s - no info
        .filter(name => name.split(" ").length == 2)   // if title, it will have more than one space, authors will have one space only separating name from initials
        .filter(name => !(/\d/.test(name)))           // ensure there is no digits - strings with digits is other part of the reference
        .map(name => capitalize(name, true));          // make it nice looking

    addFrequencyList("frequencyListTemplate", "entry", "citingAuthorsList",citingAuthorsList, 20);

    // update interface
    hide("processing");
    show("result");
    view(document, GUIvariables);   
    setupSlider(hIndex, citationList);
    }

function show(id)
    {
    document.getElementById(id).style = "display: block;"; 
    }
function hide(id)
    {
    document.getElementById(id).style = "display:none;"; 
    }
// populate html view with value using key-value pair matching element id.
function view(node,obj)
    {
    Object.keys(obj).map(key => ({element: node.getElementById(key), key}))
          .filter(({element}) => element != null)
          .forEach(({element, key}) => element.innerText = obj[key]);
    }

/* generic template population funct|ion
        templateID: the overall template id ref
        insertionPoint: DOM reference to where it should be inserted in the doc
        dataPairs: key value pairs with ids to span sub elements, and their populated value
        rootElementID: id of the root div inside the template to populate 
*/
function createAndPopulateTemplate(templateID, insertionPoint, dataPairs, rootElementID = false)
    {
    let ret = {};   // data structure with access to all the added elements created
    let IDs = Object.keys(dataPairs);    
    // reference to template
    let template = document.getElementById(templateID);     
    // template with or without root note
    if (rootElementID != false)  // with root node everything incorporated
        {
        let rootElement = template.content.querySelector("#"+rootElementID);
        let element = document.importNode(rootElement, true);
        insertionPoint.appendChild(element);
        ret[rootElementID] = element;
        IDs.forEach(id =>
            {
            let elementForID = element.querySelector("#"+id);      
            elementForID.innerHTML = dataPairs[id];   
            ret[id] = elementForID;    
            });
        }
    else    // without root node
        {
        IDs.forEach(id =>
            {
            let elementForID = template.content.querySelector("#"+id);    
            let element = document.importNode(elementForID, true);
            insertionPoint.appendChild(element);
            element.innerHTML = dataPairs[id];  // populate the template
            ret[id] = element;    
            });
        }
    return ret;
    }

// strip all non-text, space and punctuation characters
let keepTextRegExp = /[^\p{Letter}\p{Mark}\s\.\-]+/gu;
let spaceRegExp = /\s{2,}/g;
function keepText(text)
    {
    return text.replaceAll(keepTextRegExp, "")
               .replaceAll(spaceRegExp, " ")
               .trim();
    }    

function textToWords(text)
    {
    return keepText(text).toLowerCase().split(" ");
    }

const capitalize = (str, lower = false) =>
    (lower ? str.toLowerCase() : str).replace(/(?:^|\s|["'([{])+\S/g, match => match.toUpperCase());
  

// optimized for speed - maintain list of word bigrams, computed before comparisons.
// this is the bottleneck during processing
// text distance measure inspired by word-based DICE
function prepareWordBigram(text)
    {
    const wordArr = textToWords(text);
    return wordArr.filter((e, i) => i < wordArr.length - 1)
                   .map((e, i) => e + " " + wordArr[i + 1]);	
    }

// remember to clean up unused parameters later.
// more bare bones for reuse of bigram datastructure
function wordBigramDice(bigrams1, bigrams2, bigramSet1, bigramSet2)
    {
    // filter over the shortest of the two bigrams to speedup
    let [bigrams, set] = bigrams1.length > bigrams2.length
            ? [bigrams2, bigramSet1]
            : [bigrams1, bigramSet2];
    // find intersecting bigrams
    const intersection = bigrams.filter(e => set.has(e));   // superfast
    return intersection.length / (Math.min(bigrams1.length, bigrams2.length));  
    }

function optimizedWordBigramDice(bigrams1, bigrams2, bigramSet1, bigramSet2, threshold)
    {
    // optimization - do not need the list, just need the count
    let denominator = (bigrams1.length + bigrams2.length) / 2;
    let biGramThreshold = Math.ceil(threshold * denominator);
//console.log(biGramThreshold, denom);         
    let [smallest, largest] = bigrams1.length > bigrams2.length
        ? [bigrams2, bigramSet1]
        : [bigrams1, bigramSet2];
    let intersectionSize = 0;
    // to through first half of elements
    for (let i = 0;i < biGramThreshold; i++)
        {
        if (largest.has(smallest[i]))
            {
            intersectionSize++;
            }    
        }
    if (intersectionSize == 0)
        {
        return 0;   // if nothing found yet, abort early with no match - not posible to meet threshold
        }
        // to through first half of elements
    for (let i = biGramThreshold;i < smallest.length; i++)
        {
        if (largest.has(smallest[i]))
            {
            intersectionSize++;
            }    
        }
    return intersectionSize / denominator;
    }

function wordAssymetricBigramDice(text1, text2)
    {
    let bigrams1 = prepareWordBigram(text1);   
    let bigrams2 = prepareWordBigram(text2);   
    let bigramSet1 = new Set(bigrams1);  
    let bigramSet2 = new Set(bigrams2);  
    bigrams1 =  [...bigramSet1];    // keep unique instances only 
    bigrams2 =  [...bigramSet2];    // keep unique instances only 
    return wordBigramDice(bigrams1, bigrams2, bigramSet1, bigramSet2); 
    }

function addFrequencyList(templateID, templateRootNodeID, insertionPointID, fullList, maxLength = 10, minFrequency = 1)
    {
    if (fullList.length == 0)       // Error message if data not available
        {
        createAndPopulateTemplate(templateID, document.getElementById(insertionPointID), {item:"Data not available, please include in Scopus export"}, templateRootNodeID);
        return;    
        } 
    let histogram = Object.groupBy(fullList, (e => e));
    let keys = Object.keys(histogram).toSorted((a,b) => histogram[b].length - histogram[a].length)
                     .filter(key => histogram[key].length > minFrequency)  // need at least two pubs or more on one publisher
                     .slice(0, maxLength)
                     .forEach(key => 
                        {
                        let dataPairs = {item:filterOuput(key), frequency: histogram[key].length}; 
                        createAndPopulateTemplate(templateID, document.getElementById(insertionPointID), dataPairs, templateRootNodeID);                                    
                        });    
    }
function addPreparedFrequencyList(templateID, templateRootNodeID, insertionPointID, fullList, maxLength = 10, minFrequency = 1)
    {
    if (fullList.length == 0)       // Error message if data not available
        {
        createAndPopulateTemplate(templateID, document.getElementById(insertionPointID), {item:"Data not available, please include in Scopus export"}, templateRootNodeID);
        return;    
        } 
    fullList.filter(({frequency},i) => i < maxLength && frequency > minFrequency)
            .forEach(dataPair => 
        {
        createAndPopulateTemplate(templateID, document.getElementById(insertionPointID), dataPair, templateRootNodeID);                                    
        });    
    }

function setupSlider(hIndex,citationList)
    {
    let slider = document.getElementById("hIndexPrognosis");
    let label = document.getElementById("hIndexPrognosisLabel");
    slider.min = hIndex;
    slider.value = hIndex + 1;
    slider.max = Math.min(hIndex + 10, citationList.length);
    label.innerText = slider.value;     
    slider.oninput = function() 
        {
        let hIndexTarget = this.value;
        label.innerText = hIndexTarget;
        highlightLiftedPublications(hIndex, hIndexTarget, citationList)  
        }
    highlightLiftedPublications(hIndex, slider.value, citationList)        
    }

// highlight publications in publication list when the prognosis changes
function highlightLiftedPublications(hIndex, hIndexTarget, citationList)
    {
    let noRefsToLift = hIndexTarget - hIndex;
    // update the interface by processing the pubs in decreasing degree of citations
    citationList.forEach((pub,index) => 
        {                
        let refClasses = document.getElementById(pub.index).classList;
        // get annotation reference
        let annotation = document.getElementById("annotation"+pub.index);
        // clear away possible styles
        if (refClasses.contains("toLift"))
            {
            refClasses.remove("toLift");
            // remove label
            annotation.innerText = pub.annotations.join(", ");
            annotation.classList.remove("prognosis");
            }
        let missingCitations = hIndexTarget - pub.allCitations;
        if (missingCitations > 0 && index < hIndexTarget)
            {
            noRefsToLift--; // subbract the one that is highlighted
            refClasses.add("toLift");
            annotation.classList.add("prognosis");
            // add label
            annotation.innerText = `+${missingCitations} cites...`;
            }
        });
    }


function dice(str1, str2)
    {
    if (str1.length < 2 || str2.length < 2) return 0;
    const charArr1 = [...str1.toLowerCase()], charArr2 = [...str2.toLowerCase()];
    const bigrams1 = charArr1.filter((e, i) => i < charArr1.length - 1)
                            .map((e, i) => e + charArr1[i + 1]);						
    const bigrams2 = charArr2.filter((e, i) => i < charArr2.length - 1)
                            .map((e, i) => e + charArr2[i + 1]);
    const intersection = new Set(bigrams1.filter(e => bigrams2.includes(e)));
    // count number of intersecting bigrams
    const intersectionCounts = [...intersection].map(bigram => Math.min(bigrams1.filter(e => e == bigram).length,
                                                                            bigrams2.filter(e => e == bigram).length));
    const intersectionSize = intersectionCounts.reduce((accumulator, e) => accumulator + e, 0);
    return 2*intersectionSize/(bigrams1.length + bigrams2.length);      
    }

function isSelfCitation(reference, author, authorAlternative)
    {        
    return reference.split(SCOPUS_REFERENCE_AUTHOR_DELIMINATOR)
             .map(part => part.trim())
             .some(part => dice(part,author) > stringThreshold || dice(part, authorAlternative) > stringThreshold);    
    }

// handle diacritic variations
// from https://claritydev.net/blog/diacritic-insensitive-string-comparison-javascript
const normalizeString = (str) => {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  };
