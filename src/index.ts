import { EthereumTrustManager, TrustLevel } from './eth_trust_manager.js';
import AquaHandler from "./wrapper"

let acc1Creds = JSON.parse(fs.readFileSync("./credentials/account1.json", "utf-8"))
let acc2Creds = JSON.parse(fs.readFileSync("./credentials/account2.json", "utf-8"))

let aquaHandler = new AquaHandler()

const at1 = await aquaHandler.createAquaTree("./forms/example-claim.json", "./aquatrees/example-claim.aqua.json")
const at2 = await aquaHandler.createAquaTree("./forms/example-attestation.json", "./aquatrees/example-attestation.aqua.json")
// Sign the example claim here
await at1.sign()
await at1.serialize()
// Sign the example attestation here
await at2.sign()
await at2.serialize()
// example-claim form verification
await at1.verifyForm()
// Attestation verification
// await verifyFormWorkflow("./aquatrees/example-claim.aqua.json")
// await verifyFormWorkflow("./aquatrees/example-attestation.aqua.json"),
//
const attestationAquaTreePath: string = "./aquatrees/example-attestation.aqua.json"
const attestationFilePath: string = "./forms/example-attestation.json"
const claimAquaTreePath: string = "./aquatrees/example-claim.aqua.json"
const claimFilePath: string = "./forms/example-claim.json"

const verifyFormWorkflow = async (at) => {
  // Wallet verification
  let signerWalletAddress = formAnalyzer.getSignerWalletAddress(at)
  let claimerWalletAddress = formAnalyzer.getClaimerWalletAddress(at)
  let IdentityClaimformType: string = formAnalyzer.getFormType(at)

  console.log(`Form Type: ${IdentityClaimformType.toUpperCase()}`)

  if (signerWalletAddress !== claimerWalletAddress) {
      console.log("Signer not claim issuer")
  }

  // Signature verification
  let claimverificationResults = await at.verifyForm()

  if (!claimverificationResults?.isValidationSucessful) {
      throw new Error("Claim validation not successful");
  }

  let isWalletAddressValid = false
  let revisionType = claimverificationResults.revisionType

  if (revisionType === "form") {
      console.log(`Form Revision with hash: ${claimverificationResults.hash} `)
      console.log("Revision Type: Form")
      if (claimverificationResults.isValidationSucessful) {
          log_success(`${LogTypeEmojis.success} Validation successful`)
      } else {
          log_red(`${LogTypeEmojis.error} Validation failed`)
      }

      let claimVerificationInfo: FormVerificationGraphData = claimverificationResults.info as FormVerificationGraphData;
      for (let i = 0; i < claimVerificationInfo.formKeys.length; i++) {
          let el = claimVerificationInfo.formKeys[i]
          let formKeyName = el.formKey.split("forms_")[1]
          if (el.isValidationSucessful) {
              console.log(`${LogTypeEmojis.success} ${formKeyName}: validated successfully`)
          } else {
              log_red(`${formKeyName} : Failed to validate`)
          }

          if (formKeyName === "wallet_address") {
              isWalletAddressValid = el.isValidationSucessful
          }

      }
      console.log("\n")
  }
  else {
      console.log(`${revisionType} Detected`)
  }

  let claimSecondRevision = claimverificationResults.verificationGraphData[0]

  if (!claimSecondRevision || !claimSecondRevision.isValidationSucessful) {
      throw new Error("The signature revision is not valid")
  }

  // TODO: Sequence of revisions. Attestation comes after the identity claim
  if (claimSecondRevision.revisionType !== "signature") {
      throw new Error("The second revision of the claim is not a signature");
  }

  let secondRevisionInfo: SignatureVerificationGraphData = claimSecondRevision.info as SignatureVerificationGraphData;
  console.log("Revision Type: Signature Revision")
  console.log(`Wallet address: ${secondRevisionInfo.walletAddress}`)
  console.log(`Signature Type: ${secondRevisionInfo.signatureType}`)
  console.log(`Validation ${secondRevisionInfo.isValidationSucessful ? "succesful" : "failed"}`)
  console.log("\n")
  let walletAddressFromSignature = secondRevisionInfo.walletAddress

  // If form_wallet_address == signature returned wallet address = OK
  if (walletAddressFromSignature === claimerWalletAddress && isWalletAddressValid) {
      log_success(`${LogTypeEmojis.success} Valid identiy claim detected`)
  }
  else {
      log_red(`${LogTypeEmojis.error} Invalid identiy claim`)
  }

}

// Verification
log_yellow("\nClaim verification")
await verifyFormWorkflow(claimAquaTreePath)

log_yellow("\nAttestation verification")
await verifyFormWorkflow(attestationAquaTreePath)

// Compare value key pairs of claim and attestations to be identical except type, wallet, identiy claim id, comment
log_yellow("\nIdentity verification")
const attestationVerificationResults = await aquaHandler.verifyForm(attestationAquaTreePath, attestationFilePath)
const claimVerificationResults = await aquaHandler.verifyForm(claimAquaTreePath, claimFilePath)

if (!attestationVerificationResults) {
    console.log("No attestation verification results")
}

if (!claimVerificationResults) {
    console.log("No claim verification results")
}

// console.log(JSON.stringify(attestationVerificationResults, null, 4))
// console.log(JSON.stringify(claimVerificationResults, null, 4))

let attestationVerificationInfo: FormVerificationGraphData = attestationVerificationResults!!.info as FormVerificationGraphData;
let claimVerificationInfo: FormVerificationGraphData = claimVerificationResults!!.info as FormVerificationGraphData;

let attestationKeys = attestationVerificationInfo.formKeys
let claimKeys = claimVerificationInfo.formKeys

// Testing the identity claim ID
let attestationIdentityClaimId = attestationVerificationInfo.formKeys.find((field: FormKeyGraphData) => field.formKey === "forms_identity_claim_id")?.content
let claimHash = claimVerificationResults?.hash

if (attestationIdentityClaimId === claimHash) {
    console.log(`${LogTypeEmojis.success} Valid identity claim ID: ${attestationIdentityClaimId}`)
} else {
    console.log(`${LogTypeEmojis.error} Invalid identity claim ID: ${attestationIdentityClaimId} === ${claimHash}`)
}

console.log("\n")

// Filtering expected mismatches
let commonKeys = claimKeys.filter((field: FormKeyGraphData) => field.formKey !== "forms_wallet_address" && field.formKey !== "forms_type").map(field => field.formKey)

for (let i = 0; i < commonKeys.length; i++) {
    const keyName = commonKeys[i];

    console.log(`Form key name: ${keyName.split("forms_")[1]}`)
    let attestationField = attestationKeys.find((field: FormKeyGraphData) => field.formKey === keyName)
    let claimField = claimKeys.find((field: FormKeyGraphData) => field.formKey === keyName)
    if (attestationField && claimField) {
        let contentIsEqual = attestationField.content === claimField?.content
        console.log(`${contentIsEqual ? LogTypeEmojis.success : LogTypeEmojis.error} Attestation value: ${attestationField.content} --- Claim value: ${claimField?.content} \n`)
    } else {
        console.log(`Form Key: '${keyName}' was not found on both the forms`)
    }
}
// Attestation comment
let attestationContext = attestationVerificationInfo.formKeys.find((field: FormKeyGraphData) => field.formKey === "forms_context")?.content
console.log(`Attestation context:\n${attestationContext}\n`)

// Attester wallet
let attesterWalletAddress = attestationVerificationInfo.formKeys.find((field: FormKeyGraphData) => field.formKey === "forms_wallet_address")?.content
console.log(`Attester wallet address: ${attesterWalletAddress}`)

// Wallet address check trust level

let trustManager = new EthereumTrustManager(attesterWalletAddress!!)
const trustLevel = trustManager.getTrustLevel(attesterWalletAddress!!)
console.log(`Trust level for ${attesterWalletAddress}: ${TrustLevel[trustLevel]}`)

console.log("Done")
//
