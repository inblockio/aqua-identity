import * as fs from 'fs';
import * as path from 'path';

// Enum for trust levels, mirroring PGP
enum TrustLevel {
    Unknown = 1,
    Never = 2,
    Marginal = 3,
    Full = 4,
    Ultimate = 5,
}

// Interface for trust delegation
interface TrustDelegation {
    depth: number; // Delegation depth (e.g., 1 = Trusted Introducer, 2 = Meta-Introducer)
    expires?: number; // Optional expiration timestamp (in milliseconds)
}

// Interface for an address's trust entry
interface TrustEntry {
    trustLevel: TrustLevel;
    delegation?: TrustDelegation; // Optional delegation settings
    endorsements: Map<string, TrustEntry>; // Addresses endorsing this one
}

// Class to manage Ethereum wallet addresses and their trust
class EthereumTrustManager {
    private trustDb: Map<string, TrustEntry>; // Address -> TrustEntry
    private ownerAddress: string; // The "ultimate" trusted address (akin to your own PGP key)
    private storagePath: string;

    constructor(ownerAddress: string, storagePath: string = './trust_db.json') {
        this.trustDb = new Map<string, TrustEntry>();
        this.ownerAddress = ownerAddress.toLowerCase();
        this.storagePath = storagePath;

        // Load existing data if storage file exists
        if (fs.existsSync(this.storagePath)) {
            this.loadFromStorage();
        } else {
            // Initialize owner's address with Ultimate trust
            this.trustDb.set(this.ownerAddress, {
                trustLevel: TrustLevel.Ultimate,
                endorsements: new Map<string, TrustEntry>(),
            });
            this.saveToStorage();
        }
    }

    // Save current state to storage
    private saveToStorage(): void {
        const data = Array.from(this.trustDb.entries()).map(([address, entry]) => ({
            address,
            trustLevel: entry.trustLevel,
            delegation: entry.delegation,
            endorsements: Array.from(entry.endorsements.entries())
        }));
        fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    }

    // Load state from storage
    private loadFromStorage(): void {
        const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8'));
        for (const item of data) {
            this.trustDb.set(item.address, {
                trustLevel: item.trustLevel,
                delegation: item.delegation,
                endorsements: new Map(item.endorsements)
            });
        }
    }

    // Set trust level for an address
    public setTrust(address: string, trustLevel: TrustLevel, delegation?: TrustDelegation): void {
        address = address.toLowerCase();
        if (address === this.ownerAddress && trustLevel !== TrustLevel.Ultimate) {
            throw new Error("Cannot change trust level of owner's address from Ultimate");
        }

        const entry = this.trustDb.get(address) || {
            trustLevel: TrustLevel.Unknown,
            endorsements: new Map<string, TrustEntry>(),
        };
        entry.trustLevel = trustLevel;
        if (delegation) {
            entry.delegation = delegation;
        }
        this.trustDb.set(address, entry);
        this.saveToStorage();
    }

    // Endorse an address (similar to signing a key in PGP)
    public endorseAddress(endorser: string, target: string): void {
        endorser = endorser.toLowerCase();
        target = target.toLowerCase();

        if (!this.trustDb.has(endorser)) {
            throw new Error(`Endorser ${endorser} not found in trust database`);
        }

        const targetEntry = this.trustDb.get(target) || {
            trustLevel: TrustLevel.Unknown,
            endorsements: new Map<string, TrustEntry>(),
        };
        const endorserEntry = this.trustDb.get(endorser)!;
        targetEntry.endorsements.set(endorser, endorserEntry);
        this.trustDb.set(target, targetEntry);
    }

    // Calculate validity of an address based on endorsements
    public getAddressValidity(address: string): string {
        address = address.toLowerCase();
        const entry = this.trustDb.get(address);
        if (!entry) return "Unknown";

        // Count endorsements from trusted addresses
        let fullCount = 0;
        let marginalCount = 0;

        for (const [endorser, endorserEntry] of entry.endorsements) {
            const trustLevel = this.computeEffectiveTrust(endorser, new Set());
            if (trustLevel === TrustLevel.Full || trustLevel === TrustLevel.Ultimate) {
                fullCount++;
            } else if (trustLevel === TrustLevel.Marginal) {
                marginalCount++;
            }
        }

        // Validity rules: 1 Full/Ultimate or 3 Marginal endorsements
        if (fullCount >= 1) return "Full";
        if (marginalCount >= 3) return "Marginal";
        return "Unknown";
    }

    // Compute effective trust level considering delegation
    private computeEffectiveTrust(address: string, visited: Set<string>, depth: number = 0): TrustLevel {
        address = address.toLowerCase();
        const entry = this.trustDb.get(address);
        if (!entry || visited.has(address)) return TrustLevel.Unknown;

        visited.add(address);

        // Direct trust level
        if (entry.trustLevel === TrustLevel.Never) return TrustLevel.Never;
        if (entry.trustLevel === TrustLevel.Ultimate || entry.trustLevel === TrustLevel.Full) {
            return entry.trustLevel;
        }

        // Check delegation if applicable
        if (entry.delegation && depth < entry.delegation.depth) {
            let maxDelegatedTrust = entry.trustLevel;
            for (const [endorser] of entry.endorsements) {
                const delegatedTrust: any = this.computeEffectiveTrust(endorser, visited, depth + 1);
                if (delegatedTrust > maxDelegatedTrust) {
                    maxDelegatedTrust = delegatedTrust;
                }
            }
            return maxDelegatedTrust;
        }

        return entry.trustLevel;
    }

    // Get trust level of an address
    public getTrustLevel(address: string): TrustLevel {
        address = address.toLowerCase();
        const entry = this.trustDb.get(address);
        return entry ? entry.trustLevel : TrustLevel.Unknown;
    }

    // Export trust database for inspection
    public exportTrustDb(): Record<string, { trustLevel: TrustLevel; validity: string }> {
        const result: Record<string, { trustLevel: TrustLevel; validity: string }> = {};
        for (const [address, entry] of this.trustDb) {
            result[address] = {
                trustLevel: entry.trustLevel,
                validity: this.getAddressValidity(address),
            };
        }
        return result;
    }

    // Delete a wallet address
    public deleteAddress(address: string): void {
        address = address.toLowerCase();
        if (address === this.ownerAddress) {
            throw new Error("Cannot delete owner's address");
        }
        this.trustDb.delete(address);
        this.saveToStorage();
    }

    // Get all addresses with their trust levels
    public getAllAddresses(): { address: string; trustLevel: TrustLevel }[] {
        return Array.from(this.trustDb.entries()).map(([address, entry]) => ({
            address,
            trustLevel: entry.trustLevel
        }));
    }
}

// CLI Interface
function parseArgs(): { command: string, args: string[] } {
    const args = process.argv.slice(2);
    return {
        command: args[0],
        args: args.slice(1)
    };
}

function main() {
    const { command, args } = parseArgs();
    const manager = new EthereumTrustManager("0x1234567890abcdef1234567890abcdef12345678");

    switch (command) {
        case 'set-trust':
            if (args.length < 2) {
                console.error('Usage: set-trust <address> <trust-level> [delegation-depth]');
                process.exit(1);
            }
            const trustLevel = parseInt(args[1]);
            if (isNaN(trustLevel) || trustLevel < 1 || trustLevel > 5) {
                console.error('Invalid trust level. Must be between 1 and 5');
                process.exit(1);
            }
            const delegation = args[2] ? { depth: parseInt(args[2]) } : undefined;
            manager.setTrust(args[0], trustLevel, delegation);
            console.log(`Set trust level for ${args[0]} to ${TrustLevel[trustLevel]}`);
            break;

        case 'delete-address':
            if (args.length < 1) {
                console.error('Usage: delete-address <address>');
                process.exit(1);
            }
            manager.deleteAddress(args[0]);
            console.log(`Deleted address ${args[0]}`);
            break;

        case 'get-trust':
            if (args.length < 1) {
                console.error('Usage: get-trust <address>');
                process.exit(1);
            }
            const level = manager.getTrustLevel(args[0]);
            console.log(`Trust level for ${args[0]}: ${TrustLevel[level]}`);
            break;

        case 'list-addresses':
            const addresses = manager.getAllAddresses();
            console.log('Stored addresses:');
            addresses.forEach(({ address, trustLevel }) => {
                console.log(`${address}: ${TrustLevel[trustLevel]}`);
            });
            break;

        default:
            console.log('Available commands:');
            console.log('  set-trust <address> <trust-level> [delegation-depth]');
            console.log('  delete-address <address>');
            console.log('  get-trust <address>');
            console.log('  list-addresses');
            break;
    }
}

// Run CLI if executed directly
if (require.main === module) {
    main();
}

export { EthereumTrustManager, TrustLevel };